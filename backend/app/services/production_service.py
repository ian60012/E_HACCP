"""
Production module business logic service.

Handles batch code generation, trolley metric calculations,
forming totals, packing material balance, and repack balance.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.production import (
    ProdBatch,
    ProdProduct,
    ProdFormingTrolley,
    ProdPackingRecord,
    ProdPackingTrim,
    ProdHotInput,
    ProdRepackJob,
    ProdRepackInput,
    ProdRepackOutput,
    ProdRepackTrim,
)
from app.models.inventory import InvStockDoc, InvStockLine
from app.models.enums import InvDocType, InvDocStatus


async def generate_batch_code(
    session: AsyncSession, product_code: str, production_date: date
) -> str:
    """Generate YYYYMMDD-PRODUCTCODE-NNN."""
    prefix = f"{production_date.strftime('%Y%m%d')}-{product_code}-"
    result = await session.execute(
        select(sa_func.count())
        .select_from(ProdBatch)
        .where(ProdBatch.batch_code.like(f"{prefix}%"))
    )
    count = result.scalar() or 0
    return f"{prefix}{count + 1:03d}"


async def generate_repack_batch_code(
    session: AsyncSession, repack_date: date
) -> str:
    """Generate YYYYMMDD-RP-NNN."""
    prefix = f"{repack_date.strftime('%Y%m%d')}-RP-"
    result = await session.execute(
        select(sa_func.count())
        .select_from(ProdRepackJob)
        .where(ProdRepackJob.new_batch_code.like(f"{prefix}%"))
    )
    count = result.scalar() or 0
    return f"{prefix}{count + 1:03d}"


def calculate_trolley_metrics(
    sampled_tray_count: int,
    sampled_gross_weight_sum_kg: Decimal,
    tray_tare_weight_kg: Decimal,
    total_trays_on_trolley: int,
    partial_trays_count: int,
    partial_fill_ratio: Decimal,
) -> dict:
    """
    Pure function: compute trolley metrics.
    Returns dict with avg_tray_net_weight_kg, equivalent_tray_count,
    estimated_net_weight_kg.
    """
    if sampled_tray_count <= 0:
        return {
            "avg_tray_net_weight_kg": None,
            "equivalent_tray_count": None,
            "estimated_net_weight_kg": None,
        }
    sampled_net = sampled_gross_weight_sum_kg - (
        sampled_tray_count * tray_tare_weight_kg
    )
    avg_net = sampled_net / sampled_tray_count
    full_trays = total_trays_on_trolley - partial_trays_count
    equivalent = full_trays + (partial_trays_count * partial_fill_ratio)
    estimated_net = equivalent * avg_net
    return {
        "avg_tray_net_weight_kg": avg_net,
        "equivalent_tray_count": equivalent,
        "estimated_net_weight_kg": estimated_net,
    }


async def calculate_forming_totals(
    session: AsyncSession, batch_id: int
) -> dict | None:
    """
    Sum trolley nets, calc pieces, duration, pieces/hr.
    Updates batch cached totals.
    """
    batch = await session.get(ProdBatch, batch_id)
    if not batch:
        return None

    result = await session.execute(
        select(ProdFormingTrolley).where(ProdFormingTrolley.batch_id == batch_id)
    )
    trolleys = result.scalars().all()

    total_net_weight = sum(
        float(t.estimated_net_weight_kg or 0) for t in trolleys
    )
    spec = float(batch.spec_piece_weight_g)
    total_pieces = int(total_net_weight * 1000 / spec) if spec > 0 else 0

    duration_minutes = None
    pieces_per_hour = None
    if batch.start_time and batch.end_time:
        duration = batch.end_time - batch.start_time
        duration_minutes = duration.total_seconds() / 60
        if duration_minutes > 0:
            pieces_per_hour = total_pieces / (duration_minutes / 60)

    # Update cached totals on the batch
    batch.estimated_forming_net_weight_kg = Decimal(
        str(round(total_net_weight, 3))
    )
    batch.estimated_forming_pieces = total_pieces
    await session.flush()

    return {
        "total_net_weight_kg": Decimal(str(round(total_net_weight, 3))),
        "total_pieces": total_pieces,
        "duration_minutes": duration_minutes,
        "pieces_per_hour": pieces_per_hour,
    }


async def calculate_packing_totals(
    session: AsyncSession, batch_id: int
) -> dict | None:
    """Material balance calculation for packing."""
    batch = await session.get(ProdBatch, batch_id)
    if not batch:
        return None

    forming_input = float(batch.estimated_forming_net_weight_kg or 0)

    result_records = await session.execute(
        select(ProdPackingRecord).where(ProdPackingRecord.batch_id == batch_id)
    )
    records = result_records.scalars().all()

    result_trims = await session.execute(
        select(ProdPackingTrim).where(ProdPackingTrim.batch_id == batch_id)
    )
    trims = result_trims.scalars().all()

    # Dynamically group packing records by pack_type
    by_pack_type: dict[str, float] = {}
    for r in records:
        wt = float(r.theoretical_total_weight_kg or (r.bag_count * r.nominal_weight_kg))
        by_pack_type[r.pack_type] = by_pack_type.get(r.pack_type, 0) + wt
    total_packed = sum(by_pack_type.values())
    total_trim = sum(float(t.weight_kg) for t in trims)
    output_total = total_packed + total_trim
    loss = forming_input - output_total
    loss_rate = (loss / forming_input * 100) if forming_input > 0 else 0

    result = {
        "forming_input_kg": Decimal(str(round(forming_input, 3))),
        "total_packed_kg": Decimal(str(round(total_packed, 3))),
        "total_trim_kg": Decimal(str(round(total_trim, 3))),
        "output_total_kg": Decimal(str(round(output_total, 3))),
        "loss_kg": Decimal(str(round(loss, 3))),
        "loss_rate": round(loss_rate, 2),
        "by_pack_type": {k: Decimal(str(round(v, 3))) for k, v in by_pack_type.items()},
    }
    return result


async def calculate_repack_totals(
    session: AsyncSession, repack_job_id: int
) -> dict | None:
    """Repack material balance calculation."""
    result_inputs = await session.execute(
        select(ProdRepackInput).where(
            ProdRepackInput.repack_job_id == repack_job_id
        )
    )
    inputs = result_inputs.scalars().all()

    result_outputs = await session.execute(
        select(ProdRepackOutput).where(
            ProdRepackOutput.repack_job_id == repack_job_id
        )
    )
    outputs = result_outputs.scalars().all()

    result_trims = await session.execute(
        select(ProdRepackTrim).where(
            ProdRepackTrim.repack_job_id == repack_job_id
        )
    )
    trims = result_trims.scalars().all()

    input_total = sum(
        float(i.total_weight_kg or (i.bag_count * i.nominal_weight_kg))
        for i in inputs
    )
    output_total = sum(
        float(o.total_weight_kg or (o.bag_count * o.nominal_weight_kg))
        for o in outputs
    )
    trim_total = sum(float(t.weight_kg) for t in trims)
    loss = input_total - (output_total + trim_total)
    loss_rate = (loss / input_total * 100) if input_total > 0 else 0

    return {
        "input_total_kg": Decimal(str(round(input_total, 3))),
        "output_total_kg": Decimal(str(round(output_total, 3))),
        "trim_total_kg": Decimal(str(round(trim_total, 3))),
        "loss_kg": Decimal(str(round(loss, 3))),
        "loss_rate": round(loss_rate, 2),
    }


async def calculate_hot_process_balance(
    session: AsyncSession, batch_id: int
) -> dict | None:
    """Calculate material balance for hot-process batches.
    packed_weight_kg = sum of packing records (packing is the weight measurement point).
    """
    result = await session.execute(
        select(ProdBatch)
        .options(selectinload(ProdBatch.packing_records))
        .where(ProdBatch.id == batch_id)
    )
    batch = result.scalar_one_or_none()
    if not batch:
        return None

    packed_kg = sum(
        float(r.theoretical_total_weight_kg or (r.bag_count * r.nominal_weight_kg))
        for r in batch.packing_records
    )
    # Sum from hot_inputs if any exist, otherwise fall back to legacy input_weight_kg
    hot_input_result = await session.execute(
        select(sa_func.sum(ProdHotInput.weight_kg)).where(ProdHotInput.prod_batch_id == batch_id)
    )
    hot_input_sum = hot_input_result.scalar()
    if hot_input_sum is not None and hot_input_sum > 0:
        input_kg = float(hot_input_sum)
    elif batch.input_weight_kg:
        input_kg = float(batch.input_weight_kg)
    else:
        input_kg = None

    if input_kg and input_kg > 0:
        loss_kg = input_kg - packed_kg
        loss_rate = (loss_kg / input_kg) * 100
    else:
        loss_kg = None
        loss_rate = None

    return {
        "input_weight_kg": Decimal(str(round(input_kg, 3))) if input_kg is not None else None,
        "packed_weight_kg": Decimal(str(round(packed_kg, 3))),
        "loss_weight_kg": Decimal(str(round(loss_kg, 3))) if loss_kg is not None else None,
        "loss_rate": Decimal(str(round(loss_rate, 2))) if loss_rate is not None else None,
    }


async def enter_batch_to_inventory(
    session: AsyncSession, batch_id: int, location_id: int, operator_id: int
) -> InvStockDoc:
    """Create and post a stock-IN document for a closed production batch.
    Entry quantity = total packed bags grouped by product.
    Supports both hot_process and forming batches with per-product inventory lines.
    """
    from collections import defaultdict

    # Load batch with packing records
    result = await session.execute(
        select(ProdBatch)
        .options(selectinload(ProdBatch.packing_records))
        .where(ProdBatch.id == batch_id)
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")

    batch_status = batch.status.value if hasattr(batch.status, "value") else batch.status
    if batch_status != "closed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Batch must be closed before entering stock"
        )
    if batch.inv_stock_doc_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stock has already been entered for this batch"
        )

    # Load the batch's main product (by batch.product_code) to get product_type and fallback id
    main_prod_result = await session.execute(
        select(ProdProduct).where(ProdProduct.code == batch.product_code)
    )
    main_product = main_prod_result.scalar_one_or_none()
    if not main_product:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Production product not found"
        )

    if not batch.packing_records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No packing records recorded for this batch"
        )

    # Resolve inv_item_id for each packing record:
    # Primary: rec.inv_item_id (set at packing time)
    # Fallback: product.inv_item_id (from ProdProduct linked to the record or batch main product)
    # Collect all product_ids that need fallback resolution
    fallback_product_ids: set[int] = set()
    for rec in batch.packing_records:
        if rec.inv_item_id is None:
            fallback_product_ids.add(rec.product_id if rec.product_id is not None else main_product.id)

    products_by_id: dict[int, ProdProduct] = {}
    if fallback_product_ids:
        prods_result = await session.execute(
            select(ProdProduct).where(ProdProduct.id.in_(list(fallback_product_ids)))
        )
        products_by_id = {p.id: p for p in prods_result.scalars().all()}

    # Build bags_by_inv_item, collecting any records that can't be resolved
    bags_by_inv_item: dict[int, int] = defaultdict(int)
    unresolvable: list[str] = []
    for rec in batch.packing_records:
        iid = rec.inv_item_id
        if iid is None:
            pid = rec.product_id if rec.product_id is not None else main_product.id
            product = products_by_id.get(pid)
            if product and product.inv_item_id:
                iid = product.inv_item_id
            else:
                label = f"包裝類型 {rec.pack_type}（袋數: {rec.bag_count}）"
                unresolvable.append(label)
                continue
        bags_by_inv_item[iid] += int(rec.bag_count)

    if unresolvable:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"以下裝袋記錄未設定庫存品項，也找不到產品的庫存品項連結：{', '.join(unresolvable)}"
        )

    total_bags = sum(bags_by_inv_item.values())
    if total_bags <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No packing records recorded for this batch"
        )

    # Generate doc number (reuse inventory_service logic inline)
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"IN-{today}-"
    count_result = await session.execute(
        select(sa_func.count()).where(InvStockDoc.doc_number.like(f"{prefix}%"))
    )
    count = count_result.scalar() or 0
    doc_number = f"{prefix}{count + 1:04d}"

    # Create stock-IN document
    doc = InvStockDoc(
        doc_number=doc_number,
        doc_type=InvDocType.IN,
        status=InvDocStatus.DRAFT,
        location_id=location_id,
        operator_id=operator_id,
        notes=f"Production batch: {batch.batch_code}",
    )
    session.add(doc)
    await session.flush()

    # Create one InvStockLine per inv_item_id group
    for iid, bags in bags_by_inv_item.items():
        line = InvStockLine(
            doc_id=doc.id,
            item_id=iid,
            location_id=location_id,
            quantity=Decimal(str(bags)),
            unit="包",
        )
        session.add(line)
    await session.flush()

    # Post the document using inventory_service
    from app.services.inventory_service import post_document
    posted_doc = await post_document(session, doc.id, operator_id)

    # Link batch to stock doc
    batch.inv_stock_doc_id = posted_doc.id
    await session.flush()

    return posted_doc
