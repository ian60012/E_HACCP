"""Meat workflow, immutable revisions and kilogram stock entry."""
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import HTTPException, Request, Depends
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.production import ProdBatch, ProdProduct, ProdPackTypeConfig
from app.models.meat_processing import MeatRecord, MeatInput, MeatStep, MeatOutput, MeatLoss
from app.models.inventory import InvItem, InvLocation, InvStockDoc, InvStockLine
from app.models.receiving_log import ReceivingLog
from app.schemas.meat_processing import MeatRead, MeatTotals
from app.services.audit_service import create_audit_entry


def value(v):
    return v.value if hasattr(v, "value") else v


async def batch_type(db, batch):
    if batch.process_type:
        return batch.process_type
    return value(await db.scalar(select(ProdProduct.product_type).where(ProdProduct.code == batch.product_code)))


async def protect_legacy_meat(request: Request, db=Depends(get_db)):
    """Legacy mutations must never write meat batches, even before verification."""
    batch_id = request.path_params.get("batch_id")
    if request.method in ("GET", "HEAD", "OPTIONS") or not batch_id or request.url.path.endswith("/void"):
        return
    try:
        parsed_id = int(batch_id)
    except ValueError:
        raise HTTPException(422, "Invalid batch ID")
    batch = await db.scalar(select(ProdBatch).where(ProdBatch.id == parsed_id).with_for_update())
    if batch and await batch_type(db, batch) == "meat_processing":
        raise HTTPException(409, "請使用肉品加工流程 Use the meat processing workflow")


def record_query():
    return select(MeatRecord).options(*[selectinload(getattr(MeatRecord, name)) for name in ("inputs", "steps", "outputs", "losses")])


async def latest(db, batch_id):
    return await db.scalar(record_query().where(MeatRecord.batch_id == batch_id).order_by(MeatRecord.version.desc()).limit(1))


def totals(record):
    sums = {name: sum((r.weight_kg for r in getattr(record, name)), Decimal(0)) for name in ("inputs", "outputs", "losses")}
    return MeatTotals(input_kg=sums["inputs"], output_kg=sums["outputs"], loss_kg=sums["losses"],
        difference_kg=sums["inputs"] - sums["outputs"] - sums["losses"],
        yield_pct=(sums["outputs"] / sums["inputs"] * 100).quantize(Decimal("0.01")) if sums["inputs"] else None)


def response(record):
    if not record:
        return None
    data = {name: getattr(record, name) for name in MeatRead.model_fields if name != "totals"}
    return MeatRead(**data, totals=totals(record))


async def lock_batch(db, batch_id, version=None, mutable=True):
    batch = await db.scalar(select(ProdBatch).where(ProdBatch.id == batch_id).with_for_update())
    if not batch:
        raise HTTPException(404, "Batch not found")
    if await batch_type(db, batch) != "meat_processing":
        raise HTTPException(409, "Not a meat processing batch")
    if mutable and (batch.is_voided or batch.inv_stock_doc_id):
        raise HTTPException(409, "批次已作廢或入庫 Batch is voided or stocked")
    record = await latest(db, batch_id)
    if version is not None and version != (record.version if record else 0):
        raise HTTPException(409, "資料已更新，請重新載入 Record changed; reload before saving")
    return batch, record


async def validate_refs(db, data):
    input_items, output_items, locations = {}, {}, {}
    for row in data.inputs:
        item = await db.get(InvItem, row.inv_item_id)
        if not item or not item.is_active or value(item.item_type) not in ("raw", "intermediate"):
            raise HTTPException(422, "投入須為有效原料或半成品 Input must be an active raw/intermediate item")
        input_items[item.id] = item
        if row.receiving_log_id:
            receiving = await db.get(ReceivingLog, row.receiving_log_id)
            if not receiving or receiving.is_voided or receiving.inv_item_id != item.id:
                raise HTTPException(422, "收貨記錄與原料不符 Receiving record does not match input")
    for row in data.outputs:
        item = await db.scalar(select(InvItem).options(selectinload(InvItem.allowed_locations)).where(InvItem.id == row.inv_item_id))
        if not item or not item.is_active or value(item.item_type) not in ("intermediate", "finished") or item.base_unit.strip().lower() not in ("kg", "公斤"):
            raise HTTPException(422, "產出須為以公斤管理的有效半成品或成品 Output must use kg")
        loc = await db.get(InvLocation, row.location_id)
        if not loc or not loc.is_active or loc.id not in {x.id for x in item.allowed_locations}:
            raise HTTPException(422, "產出品項不允許存放於此庫位 Output location is not allowed")
        if row.pack_type:
            pack = await db.scalar(select(ProdPackTypeConfig).where(ProdPackTypeConfig.code == row.pack_type))
            if not pack or not pack.is_active or pack.applicable_type != "meat_processing":
                raise HTTPException(422, "包裝類型須明確適用肉品加工 Pack type must apply to meat processing")
        output_items[item.id], locations[loc.id] = item, loc
    return input_items, output_items, locations


async def audit(db, record, user, action, old=None):
    await create_audit_entry(db=db, table_name="prod_meat_records", record_id=record.id,
        action=action, changed_by=user.id, changed_fields=["version", "state"],
        old_values=old, new_values={"version": record.version, "state": record.state},
        reason=f"Meat batch {record.batch_id}")


async def save(db, batch_id, data, user):
    batch, previous = await lock_batch(db, batch_id, data.version)
    if previous and previous.state in ("verified", "stocked"):
        raise HTTPException(409, "覆核後不可修改 Verified record is locked")
    ins, outs, locs = await validate_refs(db, data)
    record = MeatRecord(batch_id=batch.id, version=data.version + 1, state="draft", created_by=user.id,
        difference_reason=data.difference_reason,
        inputs=[MeatInput(**r.model_dump(), item_name=ins[r.inv_item_id].name) for r in data.inputs],
        steps=[MeatStep(**r.model_dump(), seq=i + 1) for i, r in enumerate(data.steps)],
        outputs=[MeatOutput(**r.model_dump(), item_name=outs[r.inv_item_id].name, location_name=locs[r.location_id].name) for r in data.outputs],
        losses=[MeatLoss(**r.model_dump()) for r in data.losses])
    db.add(record)
    await db.flush()
    await audit(db, record, user, "CREATE", {"previous_version": data.version})
    return record


def validate_complete(record):
    if not record or not record.inputs or not record.outputs or not record.steps:
        raise HTTPException(422, "須有投入、產出及工序 Inputs, outputs and steps required")
    if any(not r.start_time or not r.end_time for r in record.steps):
        raise HTTPException(422, "請完成所有已新增工序的起訖時間 Complete step start/end times")
    if totals(record).difference_kg != 0 and not record.difference_reason.strip():
        raise HTTPException(422, "請說明重量差額 Explain the weight difference")


async def complete(db, batch_id, data, user):
    _, record = await lock_batch(db, batch_id, data.version)
    if not record or record.state != "draft":
        raise HTTPException(409, "Only a draft can be completed")
    validate_complete(record)
    await validate_refs(db, record)
    record.state = "submitted"
    record.completed_by, record.completed_at = user.id, datetime.now(timezone.utc)
    record.operator_signature_data_url = data.operator_signature_data_url
    await audit(db, record, user, "UPDATE", {"state": "draft"})
    return record


async def verify(db, batch_id, data, user):
    _, record = await lock_batch(db, batch_id, data.version)
    if not record or record.state != "submitted":
        raise HTTPException(409, "Only a submitted record can be verified")
    validate_complete(record)
    await validate_refs(db, record)
    record.state = "verified"
    record.verified_by, record.verified_at = user.id, datetime.now(timezone.utc)
    record.verifier_signature_data_url = data.verifier_signature_data_url
    await audit(db, record, user, "LOCK", {"state": "submitted"})
    return record


async def enter_stock(db, batch_id, data, user):
    batch, record = await lock_batch(db, batch_id, data.version)
    if not record or record.state != "verified":
        raise HTTPException(409, "須先經 QA 覆核 QA verification required")
    _, items, _ = await validate_refs(db, record)
    # Existing stock service updates balances in Python; serialize stock writers,
    # including legacy writers, so concurrent posting cannot lose increments.
    await db.execute(text("LOCK TABLE inv_stock_balance IN SHARE ROW EXCLUSIVE MODE"))
    grouped = defaultdict(Decimal)
    for row in record.outputs:
        grouped[(row.inv_item_id, row.location_id)] += row.weight_kg
    doc = InvStockDoc(doc_number=f"IN-MEAT-{batch.id}", doc_type="IN", status="Draft", operator_id=user.id,
        ref_number=batch.batch_code, notes=f"Meat batch {batch.batch_code}; revision {record.version}")
    db.add(doc)
    await db.flush()
    for (item_id, location_id), weight in sorted(grouped.items()):
        db.add(InvStockLine(doc_id=doc.id, item_id=item_id, location_id=location_id,
            quantity=weight, unit=items[item_id].base_unit))
    await db.flush()
    from app.services.inventory_service import post_document
    await post_document(db, doc.id, user.id)
    batch.inv_stock_doc_id, batch.status = doc.id, "closed"
    record.state = "stocked"
    await audit(db, record, user, "UPDATE", {"state": "verified"})
    return record
