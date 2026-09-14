from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.dependencies.auth import get_current_active_user, require_role
from app.schemas.meat_processing import MeatSave, MeatComplete, MeatVerify, MeatVersion, MeatRead
from app.services import meat_processing as service

router = APIRouter(prefix="/production/batches", tags=["Meat Processing"])


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
