"""
Cooking CCP Log router (FSP-LOG-004).

Standard 6-endpoint pattern:
  GET    /cooking-logs           — List (paginated, filterable)
  GET    /cooking-logs/{id}      — Get single
  POST   /cooking-logs           — Create (flush -> validate -> commit)
  PATCH  /cooking-logs/{id}      — Update (blocked if locked/voided)
  POST   /cooking-logs/{id}/lock — QA lock
  POST   /cooking-logs/{id}/void — Void (Manager only)
"""

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.cooking_log import CookingLog
from app.models.product import Product
from app.models.user import User
from app.schemas.cooking_log import (
    CookingLogCreate,
    CookingLogUpdate,
    CookingLogResponse,
)
from app.schemas.common import PaginatedResponse, VoidRequest
from app.dependencies.auth import get_current_active_user, require_role
from app.services.ccp_validator import validate_cooking_ccp, CCP_DEFAULT_TEMP
from app.services.qa_lock_service import lock_record
from app.services.void_service import void_record

router = APIRouter(prefix="/cooking-logs", tags=["cooking-logs"])


def _to_response(log: CookingLog) -> CookingLogResponse:
    """Map ORM model to response schema with eager-loaded relationships."""
    return CookingLogResponse(
        id=log.id,
        batch_id=log.batch_id,
        product_id=log.product_id,
        product_name=log.product.name if log.product else None,
        equipment_id=log.equipment_id,
        equipment_name=log.equipment.name if log.equipment else None,
        start_time=log.start_time,
        end_time=log.end_time,
        core_temp=log.core_temp,
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
    """Base query with eager-loaded relationships (prevents N+1)."""
    return select(CookingLog).options(
        selectinload(CookingLog.product),
        selectinload(CookingLog.equipment),
        selectinload(CookingLog.operator),
        selectinload(CookingLog.verifier),
    )


@router.get("", response_model=PaginatedResponse[CookingLogResponse])
async def list_cooking_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    batch_id: Optional[str] = None,
    is_voided: bool = Query(False),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List cooking logs with pagination and filters."""
    query = _base_query()
    count_query = select(func.count(CookingLog.id))

    # Filters
    query = query.where(CookingLog.is_voided == is_voided)
    count_query = count_query.where(CookingLog.is_voided == is_voided)
    if batch_id:
        query = query.where(CookingLog.batch_id == batch_id)
        count_query = count_query.where(CookingLog.batch_id == batch_id)

    total = (await db.execute(count_query)).scalar()
    result = await db.execute(
        query.order_by(CookingLog.created_at.desc()).offset(skip).limit(limit)
    )
    logs = result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(log) for log in logs],
        total=total, skip=skip, limit=limit,
    )


@router.get("/{log_id}", response_model=CookingLogResponse)
async def get_cooking_log(
    log_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single cooking log."""
    result = await db.execute(_base_query().where(CookingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Cooking log not found")
    return _to_response(log)


@router.post("", response_model=CookingLogResponse, status_code=status.HTTP_201_CREATED)
async def create_cooking_log(
    data: CookingLogCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a cooking log with CCP validation.

    Uses flush -> validate -> commit pattern:
    1. Insert log and flush (get ID)
    2. Run CCP validator (may auto-create deviation in same txn)
    3. Set ccp_status on log
    4. Commit (both log and any deviation in single transaction)
    """
    # Verify product exists and get CCP limit
    product_result = await db.execute(
        select(Product).where(Product.id == data.product_id)
    )
    product = product_result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    log = CookingLog(
        batch_id=data.batch_id,
        product_id=data.product_id,
        equipment_id=data.equipment_id,
        start_time=data.start_time,
        end_time=data.end_time,
        core_temp=data.core_temp,
        corrective_action=data.corrective_action,
        notes=data.notes,
        operator_id=current_user.id,
    )
    db.add(log)
    await db.flush()  # Get log.id for deviation FK

    # CCP validation
    ccp_status = await validate_cooking_ccp(
        db=db,
        cooking_log_id=log.id,
        core_temp=data.core_temp,
        ccp_limit=product.ccp_limit_temp or CCP_DEFAULT_TEMP,
        operator_id=current_user.id,
    )
    log.ccp_status = ccp_status

    # DB constraint: corrective_action required when ccp_status is not Pass/null
    if ccp_status and ccp_status.value != "Pass" and not log.corrective_action:
        log.corrective_action = (
            f"CCP failure detected: core temp {data.core_temp}C below limit "
            f"{product.ccp_limit_temp}C. Deviation auto-created. Hold for QA review."
        )

    await db.commit()

    # Reload with relationships
    result = await db.execute(_base_query().where(CookingLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.patch("/{log_id}", response_model=CookingLogResponse)
async def update_cooking_log(
    log_id: int,
    data: CookingLogUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a cooking log (blocked if locked or voided)."""
    result = await db.execute(select(CookingLog).where(CookingLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Cooking log not found")
    if log.is_locked:
        raise HTTPException(status_code=400, detail="Record is QA-locked and cannot be modified")
    if log.is_voided:
        raise HTTPException(status_code=400, detail="Record is voided and cannot be modified")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(log, field, value)

    # Re-validate CCP if core_temp was updated
    if "core_temp" in update_data:
        product_result = await db.execute(
            select(Product).where(Product.id == log.product_id)
        )
        product = product_result.scalar_one()
        ccp_status = await validate_cooking_ccp(
            db=db,
            cooking_log_id=log.id,
            core_temp=log.core_temp,
            ccp_limit=product.ccp_limit_temp or CCP_DEFAULT_TEMP,
            operator_id=current_user.id,
        )
        log.ccp_status = ccp_status

        # DB constraint: corrective_action required when ccp_status is not Pass/null
        if ccp_status and ccp_status.value != "Pass" and not log.corrective_action:
            log.corrective_action = (
                f"CCP failure detected: core temp {log.core_temp}C below limit "
                f"{product.ccp_limit_temp}C. Deviation auto-created. Hold for QA review."
            )

    await db.commit()

    # Reload with relationships
    result = await db.execute(_base_query().where(CookingLog.id == log.id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/lock", response_model=CookingLogResponse)
async def lock_cooking_log(
    log_id: int,
    current_user: User = Depends(require_role("QA", "Manager")),
    db: AsyncSession = Depends(get_db),
):
    """QA-lock a cooking log (QA/Manager only)."""
    await lock_record(db, CookingLog, log_id, current_user)
    result = await db.execute(_base_query().where(CookingLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)


@router.post("/{log_id}/void", response_model=CookingLogResponse)
async def void_cooking_log(
    log_id: int,
    body: VoidRequest,
    current_user: User = Depends(require_role("Manager")),
    db: AsyncSession = Depends(get_db),
):
    """Void a cooking log (Manager only). Works on locked records."""
    await void_record(db, CookingLog, log_id, body.void_reason, current_user)
    result = await db.execute(_base_query().where(CookingLog.id == log_id))
    log = result.scalar_one()
    return _to_response(log)
