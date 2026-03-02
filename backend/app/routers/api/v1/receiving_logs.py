"""
Receiving Log router (FSP-LOG-001).

Standard 6-endpoint pattern with receiving-specific validation:
  - Temperature checks (chilled > 5C, frozen > -18C)
  - Vehicle cleanliness and packaging integrity
  - Auto-creates deviation on failure
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.receiving_log import ReceivingLog
from app.models.enums import PassFail, Acceptance
from app.models.user import User
from app.schemas.receiving_log import (
    ReceivingLogCreate,
    ReceivingLogUpdate,
    ReceivingLogResponse,
)
from app.schemas.common import PaginatedResponse, VoidRequest
from app.dependencies.auth import get_current_active_user, require_role
from app.services.receiving_validator import validate_receiving
from app.services.qa_lock_service import lock_record
from app.services.void_service import void_record

router = APIRouter(prefix="/receiving-logs", tags=["receiving-logs"])


def _to_response(log: ReceivingLog) -> ReceivingLogResponse:
    """Map ORM model to response schema."""
    return ReceivingLogResponse(
        id=log.id,
        supplier_id=log.supplier_id,
        supplier_name=log.supplier.name if log.supplier else None,
        po_number=log.po_number,
        product_name=log.product_name,
        quantity=log.quantity,
        quantity_unit=log.quantity_unit,
        temp_chilled=log.temp_chilled,
        temp_frozen=log.temp_frozen,
        vehicle_cleanliness=log.vehicle_cleanliness.value if log.vehicle_cleanliness else None,
        packaging_integrity=log.packaging_integrity.value if log.packaging_integrity else None,
        acceptance_status=log.acceptance_status.value if log.acceptance_status else None,
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
    return select(ReceivingLog).options(
        selectinload(ReceivingLog.supplier),
        selectinload(ReceivingLog.operator),
        selectinload(ReceivingLog.verifier),
    )


@router.get("", response_model=PaginatedResponse[ReceivingLogResponse])
async def list_receiving_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    is_voided: bool = Query(False),
    supplier_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List receiving logs."""
    query = _base_query()
    count_query = select(func.count(ReceivingLog.id))

    query = query.where(ReceivingLog.is_voided == is_voided)
    count_query = count_query.where(ReceivingLog.is_voided == is_voided)
    if supplier_id:
        query = query.where(ReceivingLog.supplier_id == supplier_id)
        count_query = count_query.where(ReceivingLog.supplier_id == supplier_id)

    total = (await db.execute(count_query)).scalar()
    result = await db.execute(
        query.order_by(ReceivingLog.created_at.desc()).offset(skip).limit(limit)
    )
    logs = result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(log) for log in logs],
        total=total, skip=skip, limit=limit,
    )


@router.get("/{log_id}", response_model=ReceivingLogResponse)
async def get_receiving_log(
    log_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single receiving log."""
    result = await db.execute(_base_query().where(ReceivingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Receiving log not found")
    return _to_response(log)


@router.post("", response_model=ReceivingLogResponse, status_code=status.HTTP_201_CREATED)
async def create_receiving_log(
    data: ReceivingLogCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a receiving log with validation.

    flush -> validate -> commit pattern.
    """
    log = ReceivingLog(
        supplier_id=data.supplier_id,
        po_number=data.po_number,
        product_name=data.product_name,
        quantity=data.quantity,
        quantity_unit=data.quantity_unit,
        temp_chilled=data.temp_chilled,
        temp_frozen=data.temp_frozen,
        vehicle_cleanliness=PassFail(data.vehicle_cleanliness),
        packaging_integrity=PassFail(data.packaging_integrity),
        acceptance_status=Acceptance(data.acceptance_status),
        corrective_action=data.corrective_action,
        notes=data.notes,
        operator_id=current_user.id,
    )
    db.add(log)
    await db.flush()

    # Validate receiving inspection
    await validate_receiving(
        db=db,
        receiving_log_id=log.id,
        temp_chilled=data.temp_chilled,
        temp_frozen=data.temp_frozen,
        vehicle_cleanliness=PassFail(data.vehicle_cleanliness),
        packaging_integrity=PassFail(data.packaging_integrity),
        operator_id=current_user.id,
    )

    await db.commit()

    result = await db.execute(_base_query().where(ReceivingLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.patch("/{log_id}", response_model=ReceivingLogResponse)
async def update_receiving_log(
    log_id: int,
    data: ReceivingLogUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a receiving log (blocked if locked or voided)."""
    result = await db.execute(select(ReceivingLog).where(ReceivingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Receiving log not found")
    if log.is_locked:
        raise HTTPException(status_code=400, detail="Record is QA-locked and cannot be modified")
    if log.is_voided:
        raise HTTPException(status_code=400, detail="Record is voided and cannot be modified")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(log, field, value)

    await db.commit()

    result = await db.execute(_base_query().where(ReceivingLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/lock", response_model=ReceivingLogResponse)
async def lock_receiving_log(
    log_id: int,
    current_user: User = Depends(require_role("QA", "Manager")),
    db: AsyncSession = Depends(get_db),
):
    """QA-lock a receiving log (QA/Manager only)."""
    await lock_record(db, ReceivingLog, log_id, current_user)
    result = await db.execute(_base_query().where(ReceivingLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/void", response_model=ReceivingLogResponse)
async def void_receiving_log(
    log_id: int,
    body: VoidRequest,
    current_user: User = Depends(require_role("Manager")),
    db: AsyncSession = Depends(get_db),
):
    """Void a receiving log (Manager only)."""
    await void_record(db, ReceivingLog, log_id, body.void_reason, current_user)
    result = await db.execute(_base_query().where(ReceivingLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)
