"""Daily cleaning checklist CRUD router (FSP-LOG-CLN-003/005)."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.dependencies.auth import get_current_active_user, require_role
from app.models.cleaning_checklist import CleaningChecklist
from app.models.user import User
from app.schemas.cleaning_checklist import (
    CleaningChecklistCreate,
    CleaningChecklistItem,
    CleaningChecklistResponse,
    CleaningChecklistTemplateResponse,
    CleaningChecklistUpdate,
    CleaningLineType,
)
from app.schemas.common import PaginatedResponse, VoidRequest
from app.services.cleaning_checklist_template import get_cleaning_checklist_template
from app.services.qa_lock_service import lock_record
from app.services.void_service import void_record

router = APIRouter(prefix="/cleaning-checklists", tags=["cleaning-checklists"])


def _base_query():
    return select(CleaningChecklist).options(
        selectinload(CleaningChecklist.operator),
        selectinload(CleaningChecklist.verifier),
    )


def _to_response(checklist: CleaningChecklist) -> CleaningChecklistResponse:
    return CleaningChecklistResponse(
        id=checklist.id,
        check_date=checklist.check_date,
        line_type=checklist.line_type,
        items=[CleaningChecklistItem.model_validate(item) for item in checklist.items],
        notes=checklist.notes,
        operator_id=checklist.operator_id,
        operator_name=checklist.operator.full_name if checklist.operator else None,
        verified_by=checklist.verified_by,
        verifier_name=checklist.verifier.full_name if checklist.verifier else None,
        is_locked=checklist.is_locked,
        is_voided=checklist.is_voided,
        void_reason=checklist.void_reason,
        voided_at=checklist.voided_at,
        voided_by=checklist.voided_by,
        created_at=checklist.created_at,
    )


@router.get("/template/{line_type}", response_model=CleaningChecklistTemplateResponse)
async def get_template(
    line_type: CleaningLineType,
    current_user: User = Depends(get_current_active_user),
):
    is_dumpling = line_type == CleaningLineType.DUMPLING
    return CleaningChecklistTemplateResponse(
        line_type=line_type,
        form_code="FSP-LOG-CLN-003" if is_dumpling else "FSP-LOG-CLN-005",
        title_en="Dumpling Line Daily Cleaning Checklist" if is_dumpling else "Cooking Line Daily Cleaning Checklist",
        title_zh="水餃線每日清潔查核" if is_dumpling else "烹飪線每日清潔查核",
        items=get_cleaning_checklist_template(),
    )


@router.get("", response_model=PaginatedResponse[CleaningChecklistResponse])
async def list_cleaning_checklists(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    is_voided: bool = Query(False),
    line_type: Optional[CleaningLineType] = None,
    check_date: Optional[date] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    query = _base_query().where(CleaningChecklist.is_voided == is_voided)
    count_query = select(func.count(CleaningChecklist.id)).where(CleaningChecklist.is_voided == is_voided)
    if line_type is not None:
        query = query.where(CleaningChecklist.line_type == line_type.value)
        count_query = count_query.where(CleaningChecklist.line_type == line_type.value)
    if check_date is not None:
        query = query.where(CleaningChecklist.check_date == check_date)
        count_query = count_query.where(CleaningChecklist.check_date == check_date)

    total = (await db.execute(count_query)).scalar_one()
    rows = (
        await db.execute(
            query.order_by(CleaningChecklist.check_date.desc(), CleaningChecklist.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
    ).scalars().all()
    return PaginatedResponse(items=[_to_response(row) for row in rows], total=total, skip=skip, limit=limit)


@router.get("/{checklist_id}", response_model=CleaningChecklistResponse)
async def get_cleaning_checklist(
    checklist_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    checklist = (await db.execute(_base_query().where(CleaningChecklist.id == checklist_id))).scalar_one_or_none()
    if checklist is None:
        raise HTTPException(status_code=404, detail="Cleaning checklist not found")
    return _to_response(checklist)


@router.post("", response_model=CleaningChecklistResponse, status_code=status.HTTP_201_CREATED)
async def create_cleaning_checklist(
    data: CleaningChecklistCreate,
    current_user: User = Depends(require_role("Admin", "QA", "Production")),
    db: AsyncSession = Depends(get_db),
):
    checklist = CleaningChecklist(
        check_date=data.check_date,
        line_type=data.line_type.value,
        items=[item.model_dump(mode="json") for item in data.items],
        notes=data.notes,
        operator_id=current_user.id,
    )
    db.add(checklist)
    await db.commit()
    checklist = (await db.execute(_base_query().where(CleaningChecklist.id == checklist.id))).scalar_one()
    return _to_response(checklist)


@router.patch("/{checklist_id}", response_model=CleaningChecklistResponse)
async def update_cleaning_checklist(
    checklist_id: int,
    data: CleaningChecklistUpdate,
    current_user: User = Depends(require_role("Admin", "QA", "Production")),
    db: AsyncSession = Depends(get_db),
):
    checklist = (
        await db.execute(select(CleaningChecklist).where(CleaningChecklist.id == checklist_id))
    ).scalar_one_or_none()
    if checklist is None:
        raise HTTPException(status_code=404, detail="Cleaning checklist not found")
    if checklist.is_locked:
        raise HTTPException(status_code=400, detail="Record is QA-locked and cannot be modified")
    if checklist.is_voided:
        raise HTTPException(status_code=400, detail="Record is voided and cannot be modified")

    updates = data.model_dump(exclude_unset=True, mode="json")
    for field, value in updates.items():
        setattr(checklist, field, value)
    await db.commit()
    checklist = (await db.execute(_base_query().where(CleaningChecklist.id == checklist.id))).scalar_one()
    return _to_response(checklist)


@router.post("/{checklist_id}/lock", response_model=CleaningChecklistResponse)
async def lock_cleaning_checklist(
    checklist_id: int,
    current_user: User = Depends(require_role("Admin", "QA")),
    db: AsyncSession = Depends(get_db),
):
    await lock_record(db, CleaningChecklist, checklist_id, current_user)
    checklist = (await db.execute(_base_query().where(CleaningChecklist.id == checklist_id))).scalar_one()
    return _to_response(checklist)


@router.post("/{checklist_id}/void", response_model=CleaningChecklistResponse)
async def void_cleaning_checklist(
    checklist_id: int,
    body: VoidRequest,
    current_user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    await void_record(db, CleaningChecklist, checklist_id, body.void_reason, current_user)
    checklist = (await db.execute(_base_query().where(CleaningChecklist.id == checklist_id))).scalar_one()
    return _to_response(checklist)
