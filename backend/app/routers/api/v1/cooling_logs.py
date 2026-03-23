"""
Cooling CCP Log router (FSP-LOG-005) — most complex log type.

Supports progressive recording:
  1. POST  with start data only      -> in progress
  2. PATCH with stage1 data          -> validate stage1 CCP
  3. PATCH with end data             -> validate total CCP, final determination

CCP Rules:
  Stage 1: 60C -> 21C within 2 hours (120 min)
  Total:   60C -> <5C  within 6 hours (360 min)
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.cooling_log import CoolingLog
from app.models.user import User
from app.schemas.cooling_log import (
    CoolingLogCreate,
    CoolingLogUpdate,
    CoolingLogResponse,
)
from app.schemas.common import PaginatedResponse, VoidRequest
from app.dependencies.auth import get_current_active_user, require_role
from app.services.cooling_validator import validate_cooling_ccp
from app.services.qa_lock_service import lock_record
from app.services.void_service import void_record

router = APIRouter(prefix="/cooling-logs", tags=["cooling-logs"])


def _to_response(log: CoolingLog) -> CoolingLogResponse:
    """Map ORM model to response schema."""
    return CoolingLogResponse(
        id=log.id,
        batch_id=log.batch_id,
        prod_batch_id=log.prod_batch_id,
        hot_input_id=log.hot_input_id,
        start_time=log.start_time,
        start_temp=log.start_temp,
        stage1_time=log.stage1_time,
        stage1_temp=log.stage1_temp,
        end_time=log.end_time,
        end_temp=log.end_temp,
        goes_to_freezer=log.goes_to_freezer,
        stage1_duration_minutes=log.stage1_duration_minutes,
        total_duration_minutes=log.total_duration_minutes,
        ccp_status=log.ccp_status.value if log.ccp_status else None,
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
    return select(CoolingLog).options(
        selectinload(CoolingLog.operator),
        selectinload(CoolingLog.verifier),
    )


@router.get("", response_model=PaginatedResponse[CoolingLogResponse])
async def list_cooling_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    batch_id: Optional[str] = None,
    prod_batch_id: Optional[int] = None,
    is_voided: bool = Query(False),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List cooling logs."""
    query = _base_query()
    count_query = select(func.count(CoolingLog.id))

    query = query.where(CoolingLog.is_voided == is_voided)
    count_query = count_query.where(CoolingLog.is_voided == is_voided)
    if batch_id:
        query = query.where(CoolingLog.batch_id == batch_id)
        count_query = count_query.where(CoolingLog.batch_id == batch_id)
    if prod_batch_id is not None:
        query = query.where(CoolingLog.prod_batch_id == prod_batch_id)
        count_query = count_query.where(CoolingLog.prod_batch_id == prod_batch_id)

    total = (await db.execute(count_query)).scalar()
    result = await db.execute(
        query.order_by(CoolingLog.created_at.desc()).offset(skip).limit(limit)
    )
    logs = result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(log) for log in logs],
        total=total, skip=skip, limit=limit,
    )


@router.get("/{log_id}", response_model=CoolingLogResponse)
async def get_cooling_log(
    log_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single cooling log."""
    result = await db.execute(_base_query().where(CoolingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Cooling log not found")
    return _to_response(log)


@router.post("", response_model=CoolingLogResponse, status_code=status.HTTP_201_CREATED)
async def create_cooling_log(
    data: CoolingLogCreate,
    current_user: User = Depends(require_role("Admin", "QA", "Production")),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a cooling log with progressive CCP validation.

    flush -> validate -> commit pattern.
    Generated columns (stage1_duration_minutes, total_duration_minutes)
    are auto-computed by PostgreSQL after insert.
    """
    log = CoolingLog(
        batch_id=data.batch_id,
        prod_batch_id=data.prod_batch_id,
        hot_input_id=data.hot_input_id,
        start_time=data.start_time,
        start_temp=data.start_temp,
        stage1_time=data.stage1_time,
        stage1_temp=data.stage1_temp,
        end_time=data.end_time,
        end_temp=data.end_temp,
        goes_to_freezer=data.goes_to_freezer,
        corrective_action=data.corrective_action,
        notes=data.notes,
        operator_id=current_user.id,
    )
    db.add(log)
    await db.flush()

    # Progressive CCP validation
    ccp_status = await validate_cooling_ccp(
        db=db,
        cooling_log_id=log.id,
        start_time=data.start_time,
        start_temp=data.start_temp,
        stage1_time=data.stage1_time,
        stage1_temp=data.stage1_temp,
        end_time=data.end_time,
        end_temp=data.end_temp,
        operator_id=current_user.id,
        goes_to_freezer=data.goes_to_freezer,
    )
    log.ccp_status = ccp_status

    await db.commit()

    # Reload to get generated columns and relationships
    result = await db.execute(_base_query().where(CoolingLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.patch("/{log_id}", response_model=CoolingLogResponse)
async def update_cooling_log(
    log_id: int,
    data: CoolingLogUpdate,
    current_user: User = Depends(require_role("Admin", "QA", "Production")),
    db: AsyncSession = Depends(get_db),
):
    """
    Update a cooling log — progressive recording.

    Typically used to add stage1 or end data as cooling progresses.
    Re-runs CCP validation after update.
    """
    result = await db.execute(select(CoolingLog).where(CoolingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Cooling log not found")
    if log.is_locked:
        raise HTTPException(status_code=400, detail="Record is QA-locked and cannot be modified")
    if log.is_voided:
        raise HTTPException(status_code=400, detail="Record is voided and cannot be modified")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(log, field, value)

    # Re-run CCP validation with all current data
    ccp_status = await validate_cooling_ccp(
        db=db,
        cooling_log_id=log.id,
        start_time=log.start_time,
        start_temp=log.start_temp,
        stage1_time=log.stage1_time,
        stage1_temp=log.stage1_temp,
        end_time=log.end_time,
        end_temp=log.end_temp,
        operator_id=current_user.id,
        goes_to_freezer=log.goes_to_freezer,
    )
    if ccp_status is not None:
        log.ccp_status = ccp_status

    await db.commit()

    # Reload to get updated generated columns
    result = await db.execute(_base_query().where(CoolingLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/lock", response_model=CoolingLogResponse)
async def lock_cooling_log(
    log_id: int,
    current_user: User = Depends(require_role("Admin", "QA")),
    db: AsyncSession = Depends(get_db),
):
    """QA-lock a cooling log (Admin/QA only)."""
    await lock_record(db, CoolingLog, log_id, current_user)
    result = await db.execute(_base_query().where(CoolingLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/void", response_model=CoolingLogResponse)
async def void_cooling_log(
    log_id: int,
    body: VoidRequest,
    current_user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    """Void a cooling log (Admin only)."""
    await void_record(db, CoolingLog, log_id, body.void_reason, current_user)
    result = await db.execute(_base_query().where(CoolingLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)
