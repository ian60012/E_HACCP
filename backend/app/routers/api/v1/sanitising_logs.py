"""
Sanitising & Cleaning Log router (FSP-LOG-CLN-001).

Standard 6-endpoint pattern with ATP validation:
  - ATP > 100 RLU = Fail for RTE contact surfaces
  - Auto-creates deviation on failure
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.sanitising_log import SanitisingLog
from app.models.user import User
from app.schemas.sanitising_log import (
    SanitisingLogCreate,
    SanitisingLogUpdate,
    SanitisingLogResponse,
)
from app.schemas.common import PaginatedResponse, VoidRequest
from app.dependencies.auth import get_current_active_user, require_role
from app.models.enums import PassFail
from app.services.sanitising_validator import validate_sanitising_atp, ATP_RTE_THRESHOLD
from app.services.qa_lock_service import lock_record
from app.services.void_service import void_record

router = APIRouter(prefix="/sanitising-logs", tags=["sanitising-logs"])


def _to_response(log: SanitisingLog) -> SanitisingLogResponse:
    """Map ORM model to response schema."""
    return SanitisingLogResponse(
        id=log.id,
        area_id=log.area_id,
        area_name=log.area.name if log.area else None,
        target_description=log.target_description,
        chemical=str(log.chemical) if log.chemical else None,
        dilution_ratio=log.dilution_ratio,
        atp_result_rlu=log.atp_result_rlu,
        atp_status=str(log.atp_status) if log.atp_status else None,
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
    return select(SanitisingLog).options(
        selectinload(SanitisingLog.area),
        selectinload(SanitisingLog.operator),
        selectinload(SanitisingLog.verifier),
    )


@router.get("", response_model=PaginatedResponse[SanitisingLogResponse])
async def list_sanitising_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    is_voided: bool = Query(False),
    area_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List sanitising logs."""
    query = _base_query()
    count_query = select(func.count(SanitisingLog.id))

    query = query.where(SanitisingLog.is_voided == is_voided)
    count_query = count_query.where(SanitisingLog.is_voided == is_voided)
    if area_id:
        query = query.where(SanitisingLog.area_id == area_id)
        count_query = count_query.where(SanitisingLog.area_id == area_id)

    total = (await db.execute(count_query)).scalar()
    result = await db.execute(
        query.order_by(SanitisingLog.created_at.desc()).offset(skip).limit(limit)
    )
    logs = result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(log) for log in logs],
        total=total, skip=skip, limit=limit,
    )


@router.get("/{log_id}", response_model=SanitisingLogResponse)
async def get_sanitising_log(
    log_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single sanitising log."""
    result = await db.execute(_base_query().where(SanitisingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Sanitising log not found")
    return _to_response(log)


@router.post("", response_model=SanitisingLogResponse, status_code=status.HTTP_201_CREATED)
async def create_sanitising_log(
    data: SanitisingLogCreate,
    current_user: User = Depends(require_role("Admin", "QA", "Production")),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a sanitising log with ATP validation.

    flush -> validate -> commit pattern.
    ATP validation auto-creates deviation if RLU > 100.
    """
    # Pre-calculate atp_status so the DB constraint chk_sanitising_atp_consistency
    # (requires both fields present or both NULL) is satisfied at flush time.
    pre_atp_status: PassFail | None = None
    if data.atp_result_rlu is not None:
        pre_atp_status = PassFail.PASS if data.atp_result_rlu <= ATP_RTE_THRESHOLD else PassFail.FAIL

    log = SanitisingLog(
        area_id=data.area_id,
        target_description=data.target_description,
        chemical=data.chemical,
        dilution_ratio=data.dilution_ratio,
        atp_result_rlu=data.atp_result_rlu,
        atp_status=pre_atp_status,
        corrective_action=data.corrective_action,
        notes=data.notes,
        operator_id=current_user.id,
    )
    db.add(log)
    await db.flush()

    # Full validator for side-effects (auto-creates deviation on Fail)
    atp_status = await validate_sanitising_atp(
        db=db,
        sanitising_log_id=log.id,
        atp_result_rlu=data.atp_result_rlu,
        operator_id=current_user.id,
    )
    log.atp_status = atp_status

    await db.commit()

    result = await db.execute(_base_query().where(SanitisingLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.patch("/{log_id}", response_model=SanitisingLogResponse)
async def update_sanitising_log(
    log_id: int,
    data: SanitisingLogUpdate,
    current_user: User = Depends(require_role("Admin", "QA", "Production")),
    db: AsyncSession = Depends(get_db),
):
    """Update a sanitising log (blocked if locked or voided)."""
    result = await db.execute(select(SanitisingLog).where(SanitisingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Sanitising log not found")
    if log.is_locked:
        raise HTTPException(status_code=400, detail="Record is QA-locked and cannot be modified")
    if log.is_voided:
        raise HTTPException(status_code=400, detail="Record is voided and cannot be modified")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(log, field, value)

    # Re-validate ATP if result was updated
    if "atp_result_rlu" in update_data:
        atp_status = await validate_sanitising_atp(
            db=db,
            sanitising_log_id=log.id,
            atp_result_rlu=log.atp_result_rlu,
            operator_id=current_user.id,
        )
        log.atp_status = atp_status

    await db.commit()

    result = await db.execute(_base_query().where(SanitisingLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/lock", response_model=SanitisingLogResponse)
async def lock_sanitising_log(
    log_id: int,
    current_user: User = Depends(require_role("Admin", "QA")),
    db: AsyncSession = Depends(get_db),
):
    """QA-lock a sanitising log (Admin/QA only)."""
    await lock_record(db, SanitisingLog, log_id, current_user)
    result = await db.execute(_base_query().where(SanitisingLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/void", response_model=SanitisingLogResponse)
async def void_sanitising_log(
    log_id: int,
    body: VoidRequest,
    current_user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    """Void a sanitising log (Admin only)."""
    await void_record(db, SanitisingLog, log_id, body.void_reason, current_user)
    result = await db.execute(_base_query().where(SanitisingLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)
