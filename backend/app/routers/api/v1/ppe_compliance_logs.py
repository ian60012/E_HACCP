"""
PPE Compliance Log router (FSP-LOG-PPE-001).

Standard 6-endpoint pattern for PPE compliance checks.
"""

from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.ppe_compliance_log import PPEComplianceLog
from app.models.user import User
from app.schemas.ppe_compliance_log import (
    PPEComplianceLogCreate,
    PPEComplianceLogUpdate,
    PPEComplianceLogResponse,
)
from app.schemas.common import PaginatedResponse, VoidRequest
from app.dependencies.auth import get_current_active_user, require_role
from app.services.qa_lock_service import lock_record
from app.services.void_service import void_record

router = APIRouter(prefix="/ppe-compliance-logs", tags=["ppe-compliance-logs"])


def _to_response(log: PPEComplianceLog) -> PPEComplianceLogResponse:
    """Map ORM model to response schema."""
    return PPEComplianceLogResponse(
        id=log.id,
        check_date=log.check_date,
        area_id=log.area_id,
        area_name=log.area.name if log.area else None,
        staff_count=log.staff_count,
        hair_net=str(log.hair_net) if log.hair_net else None,
        beard_net=str(log.beard_net) if log.beard_net else None,
        clean_uniform=str(log.clean_uniform) if log.clean_uniform else None,
        no_nail_polish=str(log.no_nail_polish) if log.no_nail_polish else None,
        safety_shoes=str(log.safety_shoes) if log.safety_shoes else None,
        single_use_mask=str(log.single_use_mask) if log.single_use_mask else None,
        no_jewellery=str(log.no_jewellery) if log.no_jewellery else None,
        hand_hygiene=str(log.hand_hygiene) if log.hand_hygiene else None,
        gloves=str(log.gloves) if log.gloves else None,
        details_actions=log.details_actions,
        capa_no=log.capa_no,
        reviewed_by=log.reviewed_by,
        reviewer_name=log.reviewer.full_name if log.reviewed_by and log.reviewer else None,
        reviewed_at=log.reviewed_at,
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
    return select(PPEComplianceLog).options(
        selectinload(PPEComplianceLog.area),
        selectinload(PPEComplianceLog.operator),
        selectinload(PPEComplianceLog.verifier),
        selectinload(PPEComplianceLog.reviewer),
    )


@router.get("", response_model=PaginatedResponse[PPEComplianceLogResponse])
async def list_ppe_compliance_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    is_voided: bool = Query(False),
    area_id: Optional[int] = None,
    check_date: Optional[date] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List PPE compliance logs."""
    query = _base_query()
    count_query = select(func.count(PPEComplianceLog.id))

    query = query.where(PPEComplianceLog.is_voided == is_voided)
    count_query = count_query.where(PPEComplianceLog.is_voided == is_voided)
    if area_id:
        query = query.where(PPEComplianceLog.area_id == area_id)
        count_query = count_query.where(PPEComplianceLog.area_id == area_id)
    if check_date:
        query = query.where(PPEComplianceLog.check_date == check_date)
        count_query = count_query.where(PPEComplianceLog.check_date == check_date)

    total = (await db.execute(count_query)).scalar()
    result = await db.execute(
        query.order_by(PPEComplianceLog.created_at.desc()).offset(skip).limit(limit)
    )
    logs = result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(log) for log in logs],
        total=total, skip=skip, limit=limit,
    )


@router.get("/{log_id}", response_model=PPEComplianceLogResponse)
async def get_ppe_compliance_log(
    log_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single PPE compliance log."""
    result = await db.execute(_base_query().where(PPEComplianceLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="PPE compliance log not found")
    return _to_response(log)


@router.post("", response_model=PPEComplianceLogResponse, status_code=status.HTTP_201_CREATED)
async def create_ppe_compliance_log(
    data: PPEComplianceLogCreate,
    current_user: User = Depends(require_role("Admin", "QA", "Production")),
    db: AsyncSession = Depends(get_db),
):
    """Create a PPE compliance log."""
    log = PPEComplianceLog(
        check_date=data.check_date,
        area_id=data.area_id,
        staff_count=data.staff_count,
        hair_net=data.hair_net,
        beard_net=data.beard_net,
        clean_uniform=data.clean_uniform,
        no_nail_polish=data.no_nail_polish,
        safety_shoes=data.safety_shoes,
        single_use_mask=data.single_use_mask,
        no_jewellery=data.no_jewellery,
        hand_hygiene=data.hand_hygiene,
        gloves=data.gloves,
        details_actions=data.details_actions,
        capa_no=data.capa_no,
        operator_id=current_user.id,
    )
    db.add(log)
    await db.flush()
    await db.commit()

    result = await db.execute(_base_query().where(PPEComplianceLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.patch("/{log_id}", response_model=PPEComplianceLogResponse)
async def update_ppe_compliance_log(
    log_id: int,
    data: PPEComplianceLogUpdate,
    current_user: User = Depends(require_role("Admin", "QA", "Production")),
    db: AsyncSession = Depends(get_db),
):
    """Update a PPE compliance log (blocked if locked or voided)."""
    result = await db.execute(select(PPEComplianceLog).where(PPEComplianceLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="PPE compliance log not found")
    if log.is_locked:
        raise HTTPException(status_code=400, detail="Record is QA-locked and cannot be modified")
    if log.is_voided:
        raise HTTPException(status_code=400, detail="Record is voided and cannot be modified")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(log, field, value)

    await db.commit()

    result = await db.execute(_base_query().where(PPEComplianceLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/lock", response_model=PPEComplianceLogResponse)
async def lock_ppe_compliance_log(
    log_id: int,
    current_user: User = Depends(require_role("Admin", "QA")),
    db: AsyncSession = Depends(get_db),
):
    """QA-lock a PPE compliance log (Admin/QA only)."""
    await lock_record(db, PPEComplianceLog, log_id, current_user)
    result = await db.execute(_base_query().where(PPEComplianceLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/void", response_model=PPEComplianceLogResponse)
async def void_ppe_compliance_log(
    log_id: int,
    body: VoidRequest,
    current_user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    """Void a PPE compliance log (Admin only)."""
    await void_record(db, PPEComplianceLog, log_id, body.void_reason, current_user)
    result = await db.execute(_base_query().where(PPEComplianceLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)
