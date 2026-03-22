"""
Assembly & Packing Inspection Log router (FSP-LOG-APK-001).

6-endpoint pattern:
  GET    /assembly-logs           — List (filterable by prod_batch_id)
  GET    /assembly-logs/{id}      — Get single
  POST   /assembly-logs           — Create
  PATCH  /assembly-logs/{id}      — Update (blocked if locked/voided)
  POST   /assembly-logs/{id}/lock — QA lock
  POST   /assembly-logs/{id}/void — Void (Manager only)
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
from app.services.qa_lock_service import lock_record
from app.services.void_service import void_record

router = APIRouter(prefix="/assembly-logs", tags=["assembly-logs"])


def _to_response(log: AssemblyPackingLog) -> AssemblyPackingLogResponse:
    return AssemblyPackingLogResponse(
        id=log.id,
        prod_batch_id=log.prod_batch_id,
        prod_batch_code=log.prod_batch.batch_code if log.prod_batch else None,
        is_allergen_declared=log.is_allergen_declared,
        is_date_code_correct=log.is_date_code_correct,
        target_weight_g=log.target_weight_g,
        sample_1_g=log.sample_1_g,
        sample_2_g=log.sample_2_g,
        sample_3_g=log.sample_3_g,
        sample_4_g=log.sample_4_g,
        sample_5_g=log.sample_5_g,
        average_weight_g=log.average_weight_g,
        seal_integrity=log.seal_integrity,
        coding_legibility=log.coding_legibility,
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
    return select(AssemblyPackingLog).options(
        selectinload(AssemblyPackingLog.operator),
        selectinload(AssemblyPackingLog.verifier),
        selectinload(AssemblyPackingLog.prod_batch),
    )


@router.get("", response_model=PaginatedResponse[AssemblyPackingLogResponse])
async def list_assembly_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    prod_batch_id: Optional[int] = None,
    is_voided: bool = Query(False),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    query = _base_query().where(AssemblyPackingLog.is_voided == is_voided)
    count_query = select(func.count(AssemblyPackingLog.id)).where(
        AssemblyPackingLog.is_voided == is_voided
    )
    if prod_batch_id is not None:
        query = query.where(AssemblyPackingLog.prod_batch_id == prod_batch_id)
        count_query = count_query.where(AssemblyPackingLog.prod_batch_id == prod_batch_id)

    total = (await db.execute(count_query)).scalar()
    result = await db.execute(
        query.order_by(AssemblyPackingLog.created_at.desc()).offset(skip).limit(limit)
    )
    logs = result.scalars().all()
    return PaginatedResponse(items=[_to_response(log) for log in logs], total=total, skip=skip, limit=limit)


@router.get("/{log_id}", response_model=AssemblyPackingLogResponse)
async def get_assembly_log(
    log_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(_base_query().where(AssemblyPackingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Assembly log not found")
    return _to_response(log)


@router.post("", response_model=AssemblyPackingLogResponse, status_code=status.HTTP_201_CREATED)
async def create_assembly_log(
    data: AssemblyPackingLogCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    log = AssemblyPackingLog(
        prod_batch_id=data.prod_batch_id,
        is_allergen_declared=data.is_allergen_declared,
        is_date_code_correct=data.is_date_code_correct,
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
    await db.commit()
    result = await db.execute(_base_query().where(AssemblyPackingLog.id == log.id))
    return _to_response(result.scalar_one())


@router.patch("/{log_id}", response_model=AssemblyPackingLogResponse)
async def update_assembly_log(
    log_id: int,
    data: AssemblyPackingLogUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AssemblyPackingLog).where(AssemblyPackingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Assembly log not found")
    if log.is_locked:
        raise HTTPException(status_code=400, detail="Record is QA-locked and cannot be modified")
    if log.is_voided:
        raise HTTPException(status_code=400, detail="Record is voided and cannot be modified")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(log, field, value)
    await db.flush()
    await db.commit()

    result2 = await db.execute(_base_query().where(AssemblyPackingLog.id == log_id))
    return _to_response(result2.scalar_one())


@router.post("/{log_id}/lock", response_model=AssemblyPackingLogResponse)
async def lock_assembly_log(
    log_id: int,
    current_user: User = Depends(require_role("QA", "Manager")),
    db: AsyncSession = Depends(get_db),
):
    await lock_record(db, AssemblyPackingLog, log_id, current_user)
    result = await db.execute(_base_query().where(AssemblyPackingLog.id == log_id))
    return _to_response(result.scalar_one())


@router.post("/{log_id}/void", response_model=AssemblyPackingLogResponse)
async def void_assembly_log(
    log_id: int,
    body: VoidRequest,
    current_user: User = Depends(require_role("Manager")),
    db: AsyncSession = Depends(get_db),
):
    await void_record(db, AssemblyPackingLog, log_id, body.void_reason, current_user)
    result = await db.execute(_base_query().where(AssemblyPackingLog.id == log_id))
    return _to_response(result.scalar_one())
