from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.inventory import InvItem
from app.dependencies.auth import get_current_active_user, require_role
from app.schemas.meat_processing import MeatSave, MeatComplete, MeatVerify, MeatVersion, MeatRead, MeatLabelRequest
from app.services import meat_processing as service
from app.services.production_labels import _render_pdf, _safe_filename, build_meat_label_html

router = APIRouter(prefix="/production/batches", tags=["Meat Processing"])


@router.post("/{batch_id}/meat/carton-label-pdf")
async def carton_label_pdf(batch_id: int, data: MeatLabelRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_active_user)):
    batch, record = await service.lock_batch(db, batch_id, version=data.version, mutable=False)
    if batch.is_voided:
        raise HTTPException(409, "作廢批次不可列印標籤 Voided batches cannot print labels")
    if not record or data.output_index >= len(record.outputs):
        raise HTTPException(422, "請選擇已儲存的產出明細 Select a saved output row")
    output = record.outputs[data.output_index]
    if data.net_weight_kg > output.weight_kg:
        raise HTTPException(422, "箱淨重不得超過此列產出總重 Carton net weight exceeds output weight")
    if data.pack_count is not None and output.pack_count is not None and data.pack_count > output.pack_count:
        raise HTTPException(422, "箱包數不得超過此列產出包數 Carton pack count exceeds output pack count")
    item = await db.get(InvItem, output.inv_item_id)
    if not item:
        raise HTTPException(422, "產出品項不存在 Output item not found")
    label_html = build_meat_label_html(batch, record, output, item.code, data)
    filename = _safe_filename(f"{batch.batch_code}-{item.code}-meat-carton-label.pdf")
    # Release the batch read lock before starting the Chromium renderer.
    await db.commit()
    pdf = await _render_pdf(label_html)
    return StreamingResponse(iter([pdf]), media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store",
    })


@router.get("/{batch_id}/meat", response_model=MeatRead | None)
async def get_record(batch_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_active_user)):
    _, record = await service.lock_batch(db, batch_id, mutable=False)
    return service.response(record)


@router.get("/{batch_id}/meat/history", response_model=list[MeatRead])
async def history(batch_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_active_user)):
    await service.lock_batch(db, batch_id, mutable=False)
    result = await db.scalars(service.record_query().where(service.MeatRecord.batch_id == batch_id).order_by(service.MeatRecord.version.desc()))
    return [service.response(r) for r in result]


@router.put("/{batch_id}/meat", response_model=MeatRead)
async def save(batch_id: int, data: MeatSave, db: AsyncSession = Depends(get_db), user=Depends(require_role("Admin", "Production"))):
    record = await service.save(db, batch_id, data, user)
    await db.commit()
    return service.response(record)


@router.post("/{batch_id}/meat/complete", response_model=MeatRead)
async def complete(batch_id: int, data: MeatComplete, db: AsyncSession = Depends(get_db), user=Depends(require_role("Admin", "Production"))):
    record = await service.complete(db, batch_id, data, user)
    await db.commit()
    return service.response(record)


@router.post("/{batch_id}/meat/verify", response_model=MeatRead)
async def verify(batch_id: int, data: MeatVerify, db: AsyncSession = Depends(get_db), user=Depends(require_role("Admin", "QA"))):
    record = await service.verify(db, batch_id, data, user)
    await db.commit()
    return service.response(record)


@router.post("/{batch_id}/meat/enter-stock", response_model=MeatRead)
async def enter_stock(batch_id: int, data: MeatVersion, db: AsyncSession = Depends(get_db), user=Depends(require_role("Admin", "Production", "Warehouse"))):
    record = await service.enter_stock(db, batch_id, data, user)
    await db.commit()
    return service.response(record)
