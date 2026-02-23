"""
Assembly & Packing Log router (FSP-LOG-ASM-001).

Standard 6-endpoint pattern with assembly-specific validation:
  - Allergen not declared -> CRITICAL deviation + quarantine
  - Average weight < target -> MAJOR deviation + hold
  - average_weight_g is a DB generated column (read-only)
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.assembly_packing_log import AssemblyPackingLog
from app.models.user import User
from app.schemas.assembly_packing_log import (
    AssemblyPackingLogCreate,
    AssemblyPackingLogUpdate,
    AssemblyPackingLogResponse,
)
from app.schemas.common import PaginatedResponse, VoidRequest
from app.dependencies.auth import get_current_active_user, require_role
from app.services.assembly_validator import validate_assembly
from app.services.qa_lock_service import lock_record
from app.services.void_service import void_record

router = APIRouter(prefix="/assembly-packing-logs", tags=["assembly-packing-logs"])


def _to_response(log: AssemblyPackingLog, warnings: list[str] = None) -> AssemblyPackingLogResponse:
    """Map ORM model to response schema."""
    return AssemblyPackingLogResponse(
        id=log.id,
        batch_id=log.batch_id,
        product_id=log.product_id,
        product_name=log.product.name if log.product else None,
        is_allergen_declared=log.is_allergen_declared,
        is_date_code_correct=log.is_date_code_correct,
        label_photo_path=log.label_photo_path,
        target_weight_g=log.target_weight_g,
        sample_1_g=log.sample_1_g,
        sample_2_g=log.sample_2_g,
        sample_3_g=log.sample_3_g,
        sample_4_g=log.sample_4_g,
        sample_5_g=log.sample_5_g,
        average_weight_g=log.average_weight_g,
        seal_integrity=log.seal_integrity.value if log.seal_integrity else None,
        coding_legibility=log.coding_legibility.value if log.coding_legibility else None,
        corrective_action=log.corrective_action,
        notes=log.notes,
        warnings=warnings,
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
    return select(AssemblyPackingLog).options(
        selectinload(AssemblyPackingLog.product),
        selectinload(AssemblyPackingLog.operator),
        selectinload(AssemblyPackingLog.verifier),
    )


@router.get("", response_model=PaginatedResponse[AssemblyPackingLogResponse])
async def list_assembly_packing_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    batch_id: Optional[str] = None,
    is_voided: bool = Query(False),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List assembly & packing logs."""
    query = _base_query()
    count_query = select(func.count(AssemblyPackingLog.id))

    query = query.where(AssemblyPackingLog.is_voided == is_voided)
    count_query = count_query.where(AssemblyPackingLog.is_voided == is_voided)
    if batch_id:
        query = query.where(AssemblyPackingLog.batch_id == batch_id)
        count_query = count_query.where(AssemblyPackingLog.batch_id == batch_id)

    total = (await db.execute(count_query)).scalar()
    result = await db.execute(
        query.order_by(AssemblyPackingLog.created_at.desc()).offset(skip).limit(limit)
    )
    logs = result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(log) for log in logs],
        total=total, skip=skip, limit=limit,
    )


@router.get("/{log_id}", response_model=AssemblyPackingLogResponse)
async def get_assembly_packing_log(
    log_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single assembly & packing log."""
    result = await db.execute(_base_query().where(AssemblyPackingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Assembly packing log not found")
    return _to_response(log)


@router.post("", response_model=AssemblyPackingLogResponse, status_code=status.HTTP_201_CREATED)
async def create_assembly_packing_log(
    data: AssemblyPackingLogCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create an assembly & packing log with validation.

    flush -> refresh (get generated avg weight) -> validate -> commit.
    Note: average_weight_g is a generated column — must refresh after flush.
    """
    log = AssemblyPackingLog(
        batch_id=data.batch_id,
        product_id=data.product_id,
        is_allergen_declared=data.is_allergen_declared,
        is_date_code_correct=data.is_date_code_correct,
        label_photo_path=data.label_photo_path,
        target_weight_g=data.target_weight_g,
        sample_1_g=data.sample_1_g,
        sample_2_g=data.sample_2_g,
        sample_3_g=data.sample_3_g,
        sample_4_g=data.sample_4_g,
        sample_5_g=data.sample_5_g,
        seal_integrity=data.seal_integrity,
        coding_legibility=data.coding_legibility,
        corrective_action=data.corrective_action,
        notes=data.notes,
        operator_id=current_user.id,
    )
    db.add(log)
    await db.flush()

    # Refresh to get the generated average_weight_g column value
    await db.refresh(log)

    # Assembly validation (allergen check, weight check)
    warnings = await validate_assembly(
        db=db,
        assembly_log_id=log.id,
        is_allergen_declared=data.is_allergen_declared,
        average_weight_g=log.average_weight_g,
        target_weight_g=data.target_weight_g,
        operator_id=current_user.id,
    )

    await db.commit()

    result = await db.execute(_base_query().where(AssemblyPackingLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log, warnings=warnings)


@router.patch("/{log_id}", response_model=AssemblyPackingLogResponse)
async def update_assembly_packing_log(
    log_id: int,
    data: AssemblyPackingLogUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an assembly & packing log (blocked if locked or voided)."""
    result = await db.execute(select(AssemblyPackingLog).where(AssemblyPackingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Assembly packing log not found")
    if log.is_locked:
        raise HTTPException(status_code=400, detail="Record is QA-locked and cannot be modified")
    if log.is_voided:
        raise HTTPException(status_code=400, detail="Record is voided and cannot be modified")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(log, field, value)

    await db.commit()

    result = await db.execute(_base_query().where(AssemblyPackingLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/lock", response_model=AssemblyPackingLogResponse)
async def lock_assembly_packing_log(
    log_id: int,
    current_user: User = Depends(require_role("QA", "Manager")),
    db: AsyncSession = Depends(get_db),
):
    """QA-lock an assembly & packing log (QA/Manager only)."""
    await lock_record(db, AssemblyPackingLog, log_id, current_user)
    result = await db.execute(_base_query().where(AssemblyPackingLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/void", response_model=AssemblyPackingLogResponse)
async def void_assembly_packing_log(
    log_id: int,
    body: VoidRequest,
    current_user: User = Depends(require_role("Manager")),
    db: AsyncSession = Depends(get_db),
):
    """Void an assembly & packing log (Manager only)."""
    await void_record(db, AssemblyPackingLog, log_id, body.void_reason, current_user)
    result = await db.execute(_base_query().where(AssemblyPackingLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)
