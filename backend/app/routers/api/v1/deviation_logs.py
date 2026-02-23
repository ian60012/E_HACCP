"""
Deviation & CAPA Log router (FSP-CAPA-LOG-001).

Standard 6-endpoint pattern + extra close endpoint for CAPA completion:
  GET    /deviation-logs             — List (filterable by source, severity, open/closed)
  GET    /deviation-logs/{id}        — Get single
  POST   /deviation-logs             — Create (manual deviation)
  PATCH  /deviation-logs/{id}        — Update CAPA fields
  POST   /deviation-logs/{id}/lock   — QA lock
  POST   /deviation-logs/{id}/void   — Void (Manager only)
  POST   /deviation-logs/{id}/close  — Close deviation (CAPA completion)

Note: Most deviations are auto-created by CCP validators via deviation_service.
This router also allows manual deviation creation.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.deviation_log import DeviationLog
from app.models.user import User
from app.schemas.deviation_log import (
    DeviationLogCreate,
    DeviationLogUpdate,
    DeviationCloseRequest,
    DeviationLogResponse,
)
from app.schemas.common import PaginatedResponse, VoidRequest
from app.dependencies.auth import get_current_active_user, require_role
from app.services.qa_lock_service import lock_record
from app.services.void_service import void_record

router = APIRouter(prefix="/deviation-logs", tags=["deviation-logs"])


def _to_response(log: DeviationLog) -> DeviationLogResponse:
    """Map ORM model to response schema."""
    return DeviationLogResponse(
        id=log.id,
        source_log_type=log.source_log_type.value if log.source_log_type else None,
        source_log_id=log.source_log_id,
        description=log.description,
        severity=log.severity.value if log.severity else None,
        immediate_action=log.immediate_action.value if log.immediate_action else None,
        immediate_action_detail=log.immediate_action_detail,
        root_cause=log.root_cause,
        preventive_action=log.preventive_action,
        closed_by=log.closed_by,
        closed_at=log.closed_at,
        closure_notes=log.closure_notes,
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
    return select(DeviationLog).options(
        selectinload(DeviationLog.operator),
        selectinload(DeviationLog.verifier),
        selectinload(DeviationLog.closer),
    )


@router.get("", response_model=PaginatedResponse[DeviationLogResponse])
async def list_deviation_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    is_voided: bool = Query(False),
    source_log_type: Optional[str] = None,
    severity: Optional[str] = None,
    is_open: Optional[bool] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List deviation logs with filters."""
    query = _base_query()
    count_query = select(func.count(DeviationLog.id))

    query = query.where(DeviationLog.is_voided == is_voided)
    count_query = count_query.where(DeviationLog.is_voided == is_voided)

    if source_log_type:
        query = query.where(DeviationLog.source_log_type == source_log_type)
        count_query = count_query.where(DeviationLog.source_log_type == source_log_type)
    if severity:
        query = query.where(DeviationLog.severity == severity)
        count_query = count_query.where(DeviationLog.severity == severity)
    if is_open is True:
        query = query.where(DeviationLog.closed_at.is_(None))
        count_query = count_query.where(DeviationLog.closed_at.is_(None))
    elif is_open is False:
        query = query.where(DeviationLog.closed_at.isnot(None))
        count_query = count_query.where(DeviationLog.closed_at.isnot(None))

    total = (await db.execute(count_query)).scalar()
    result = await db.execute(
        query.order_by(DeviationLog.created_at.desc()).offset(skip).limit(limit)
    )
    logs = result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(log) for log in logs],
        total=total, skip=skip, limit=limit,
    )


@router.get("/{log_id}", response_model=DeviationLogResponse)
async def get_deviation_log(
    log_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single deviation log."""
    result = await db.execute(_base_query().where(DeviationLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Deviation log not found")
    return _to_response(log)


@router.post("", response_model=DeviationLogResponse, status_code=status.HTTP_201_CREATED)
async def create_deviation_log(
    data: DeviationLogCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Manually create a deviation log.

    Note: Most deviations are auto-created by CCP validators.
    This endpoint is for manual deviations (e.g., observed issues).
    """
    log = DeviationLog(
        source_log_type=data.source_log_type,
        source_log_id=data.source_log_id,
        description=data.description,
        severity=data.severity,
        immediate_action=data.immediate_action,
        immediate_action_detail=data.immediate_action_detail,
        root_cause=data.root_cause,
        preventive_action=data.preventive_action,
        notes=data.notes,
        operator_id=current_user.id,
    )
    db.add(log)
    await db.commit()

    result = await db.execute(_base_query().where(DeviationLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.patch("/{log_id}", response_model=DeviationLogResponse)
async def update_deviation_log(
    log_id: int,
    data: DeviationLogUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update CAPA fields on a deviation log (blocked if locked or voided)."""
    result = await db.execute(select(DeviationLog).where(DeviationLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Deviation log not found")
    if log.is_locked:
        raise HTTPException(status_code=400, detail="Record is QA-locked and cannot be modified")
    if log.is_voided:
        raise HTTPException(status_code=400, detail="Record is voided and cannot be modified")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(log, field, value)

    await db.commit()

    result = await db.execute(_base_query().where(DeviationLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/close", response_model=DeviationLogResponse)
async def close_deviation_log(
    log_id: int,
    data: DeviationCloseRequest,
    current_user: User = Depends(require_role("QA", "Manager")),
    db: AsyncSession = Depends(get_db),
):
    """
    Close a deviation (CAPA completion).

    Requires root_cause and preventive_action. Sets closed_by and closed_at.
    QA/Manager only.
    """
    result = await db.execute(select(DeviationLog).where(DeviationLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Deviation log not found")
    if log.is_voided:
        raise HTTPException(status_code=400, detail="Cannot close a voided deviation")
    if log.closed_at is not None:
        raise HTTPException(status_code=400, detail="Deviation is already closed")

    log.root_cause = data.root_cause
    log.preventive_action = data.preventive_action
    log.closure_notes = data.closure_notes
    log.closed_by = current_user.id
    log.closed_at = datetime.now(timezone.utc)

    await db.commit()

    result = await db.execute(_base_query().where(DeviationLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/lock", response_model=DeviationLogResponse)
async def lock_deviation_log(
    log_id: int,
    current_user: User = Depends(require_role("QA", "Manager")),
    db: AsyncSession = Depends(get_db),
):
    """QA-lock a deviation log (QA/Manager only)."""
    await lock_record(db, DeviationLog, log_id, current_user)
    result = await db.execute(_base_query().where(DeviationLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/void", response_model=DeviationLogResponse)
async def void_deviation_log(
    log_id: int,
    body: VoidRequest,
    current_user: User = Depends(require_role("Manager")),
    db: AsyncSession = Depends(get_db),
):
    """Void a deviation log (Manager only)."""
    await void_record(db, DeviationLog, log_id, body.void_reason, current_user)
    result = await db.execute(_base_query().where(DeviationLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)
