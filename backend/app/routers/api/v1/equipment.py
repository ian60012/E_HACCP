"""Equipment router — CRUD for cooking equipment."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.equipment import Equipment
from app.models.user import User
from app.schemas.equipment import EquipmentResponse, EquipmentCreate, EquipmentUpdate
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user, require_role

router = APIRouter(prefix="/equipment", tags=["equipment"])


@router.get("", response_model=PaginatedResponse[EquipmentResponse])
async def list_equipment(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    is_active: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List equipment with optional active filter."""
    query = select(Equipment)
    count_query = select(func.count(Equipment.id))
    if is_active is not None:
        query = query.where(Equipment.is_active == is_active)
        count_query = count_query.where(Equipment.is_active == is_active)

    total = (await db.execute(count_query)).scalar()
    result = await db.execute(query.order_by(Equipment.name).offset(skip).limit(limit))
    items = result.scalars().all()

    return PaginatedResponse(
        items=[EquipmentResponse.model_validate(e) for e in items],
        total=total, skip=skip, limit=limit,
    )


@router.get("/{equipment_id}", response_model=EquipmentResponse)
async def get_equipment(
    equipment_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single equipment item."""
    result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return EquipmentResponse.model_validate(item)


@router.post("", response_model=EquipmentResponse, status_code=status.HTTP_201_CREATED)
async def create_equipment(
    data: EquipmentCreate,
    current_user: User = Depends(require_role("QA", "Manager")),
    db: AsyncSession = Depends(get_db),
):
    """Create new equipment (QA/Manager only)."""
    item = Equipment(**data.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return EquipmentResponse.model_validate(item)


@router.patch("/{equipment_id}", response_model=EquipmentResponse)
async def update_equipment(
    equipment_id: int,
    data: EquipmentUpdate,
    current_user: User = Depends(require_role("QA", "Manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update equipment (QA/Manager only)."""
    result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    await db.commit()
    await db.refresh(item)
    return EquipmentResponse.model_validate(item)
