"""Areas router — CRUD for cleaning zones / physical areas."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.area import Area
from app.models.user import User
from app.schemas.area import AreaResponse, AreaCreate, AreaUpdate
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user, require_role

router = APIRouter(prefix="/areas", tags=["areas"])


@router.get("", response_model=PaginatedResponse[AreaResponse])
async def list_areas(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    is_active: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List areas with optional active filter."""
    query = select(Area)
    count_query = select(func.count(Area.id))
    if is_active is not None:
        query = query.where(Area.is_active == is_active)
        count_query = count_query.where(Area.is_active == is_active)

    total = (await db.execute(count_query)).scalar()
    result = await db.execute(query.order_by(Area.name).offset(skip).limit(limit))
    areas = result.scalars().all()

    return PaginatedResponse(
        items=[AreaResponse.model_validate(a) for a in areas],
        total=total, skip=skip, limit=limit,
    )


@router.get("/{area_id}", response_model=AreaResponse)
async def get_area(
    area_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single area."""
    result = await db.execute(select(Area).where(Area.id == area_id))
    area = result.scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    return AreaResponse.model_validate(area)


@router.post("", response_model=AreaResponse, status_code=status.HTTP_201_CREATED)
async def create_area(
    data: AreaCreate,
    current_user: User = Depends(require_role("QA", "Manager")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new area (QA/Manager only)."""
    area = Area(**data.model_dump())
    db.add(area)
    await db.commit()
    await db.refresh(area)
    return AreaResponse.model_validate(area)


@router.patch("/{area_id}", response_model=AreaResponse)
async def update_area(
    area_id: int,
    data: AreaUpdate,
    current_user: User = Depends(require_role("QA", "Manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update an area (QA/Manager only)."""
    result = await db.execute(select(Area).where(Area.id == area_id))
    area = result.scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(area, field, value)

    await db.commit()
    await db.refresh(area)
    return AreaResponse.model_validate(area)
