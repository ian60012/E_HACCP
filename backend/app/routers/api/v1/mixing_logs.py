"""
Mixing Log router (FSP-LOG-MIX-001).

Standard 6-endpoint pattern for mixing/blending logs before forming.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.mixing_log import MixingLog
from app.models.user import User
from app.schemas.mixing_log import (
    MixingLogCreate,
    MixingLogUpdate,
    MixingLogResponse,
)
from app.schemas.common import PaginatedResponse, VoidRequest
from app.dependencies.auth import get_current_active_user, require_role
from app.services.qa_lock_service import lock_record
from app.services.void_service import void_record

router = APIRouter(prefix="/mixing-logs", tags=["mixing-logs"])


def _to_response(log: MixingLog) -> MixingLogResponse:
    """Map ORM model to response schema."""
    return MixingLogResponse(
        id=log.id,
        batch_id=log.batch_id,
        prod_batch_id=log.prod_batch_id,
        prod_product_id=log.prod_product_id,
        product_name=log.prod_product.name if log.prod_product else None,
        product_code=log.prod_product.code if log.prod_product else None,
        weight_kg=log.weight_kg,
        initial_temp=log.initial_temp,
        final_temp=log.final_temp,
        start_time=log.start_time,
        end_time=log.end_time,
        corrective_action=log.corrective_action,
        notes=log.notes,
        operator_id=log.operator_id,
        operator_name=log.operator.full_name if log.operator else None,
        verified_by=log.verified_by,
        verifier_name=log.verifier.full_name if log.verifier else None,
        is_locked=log.is_locked,
        is_voided=log.is_voided,
        void_reason=log.void_reason,
        voided_at=log.voided_at,
        voided_by=log.voided_by,
        created_at=log.created_at,
    )


def _base_query():
    return select(MixingLog).options(
        selectinload(MixingLog.prod_product),
        selectinload(MixingLog.operator),
        selectinload(MixingLog.verifier),
        selectinload(MixingLog.prod_batch),
    )


@router.get("", response_model=PaginatedResponse[MixingLogResponse])
async def list_mixing_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    is_voided: bool = Query(False),
    prod_batch_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List mixing logs."""
    query = _base_query()
    count_query = select(func.count(MixingLog.id))

    query = query.where(MixingLog.is_voided == is_voided)
    count_query = count_query.where(MixingLog.is_voided == is_voided)
    if prod_batch_id:
        query = query.where(MixingLog.prod_batch_id == prod_batch_id)
        count_query = count_query.where(MixingLog.prod_batch_id == prod_batch_id)

    total = (await db.execute(count_query)).scalar()
    result = await db.execute(
        query.order_by(MixingLog.created_at.desc()).offset(skip).limit(limit)
    )
    logs = result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(log) for log in logs],
        total=total, skip=skip, limit=limit,
    )


@router.get("/{log_id}", response_model=MixingLogResponse)
async def get_mixing_log(
    log_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single mixing log."""
    result = await db.execute(_base_query().where(MixingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Mixing log not found")
    return _to_response(log)


@router.post("", response_model=MixingLogResponse, status_code=status.HTTP_201_CREATED)
async def create_mixing_log(
    data: MixingLogCreate,
    current_user: User = Depends(require_role("Admin", "QA", "Production")),
    db: AsyncSession = Depends(get_db),
):
    """Create a mixing log."""
    log = MixingLog(
        batch_id=data.batch_id,
        prod_batch_id=data.prod_batch_id,
        prod_product_id=data.prod_product_id,
        weight_kg=data.weight_kg,
        initial_temp=data.initial_temp,
        final_temp=data.final_temp,
        start_time=data.start_time,
        end_time=data.end_time,
        corrective_action=data.corrective_action,
        notes=data.notes,
        operator_id=current_user.id,
    )
    db.add(log)
    await db.flush()
    await db.commit()

    result = await db.execute(_base_query().where(MixingLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.patch("/{log_id}", response_model=MixingLogResponse)
async def update_mixing_log(
    log_id: int,
    data: MixingLogUpdate,
    current_user: User = Depends(require_role("Admin", "QA", "Production")),
    db: AsyncSession = Depends(get_db),
):
    """Update a mixing log (blocked if locked or voided)."""
    result = await db.execute(select(MixingLog).where(MixingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Mixing log not found")
    if log.is_locked:
        raise HTTPException(status_code=400, detail="Record is QA-locked and cannot be modified")
    if log.is_voided:
        raise HTTPException(status_code=400, detail="Record is voided and cannot be modified")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(log, field, value)

    await db.commit()

    result = await db.execute(_base_query().where(MixingLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/lock", response_model=MixingLogResponse)
async def lock_mixing_log(
    log_id: int,
    current_user: User = Depends(require_role("Admin", "QA")),
    db: AsyncSession = Depends(get_db),
):
    """QA-lock a mixing log (Admin/QA only)."""
    await lock_record(db, MixingLog, log_id, current_user)
    result = await db.execute(_base_query().where(MixingLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/void", response_model=MixingLogResponse)
async def void_mixing_log(
    log_id: int,
    body: VoidRequest,
    current_user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    """Void a mixing log (Admin only)."""
    await void_record(db, MixingLog, log_id, body.void_reason, current_user)
    result = await db.execute(_base_query().where(MixingLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)
