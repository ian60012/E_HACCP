"""Inventory locations router (儲位管理)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.inventory import InvLocation
from app.models.user import User
from app.schemas.inventory import InvLocationCreate, InvLocationUpdate, InvLocationResponse
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user, require_role

router = APIRouter(prefix="/inventory/locations", tags=["inventory-locations"])


def _to_response(loc: InvLocation) -> InvLocationResponse:
    return InvLocationResponse(
        id=loc.id,
        code=loc.code,
        name=loc.name,
        zone=loc.zone,
        is_active=loc.is_active,
    )


@router.get("", response_model=PaginatedResponse[InvLocationResponse])
async def list_locations(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = True,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(InvLocation)
    if is_active is not None:
        q = q.where(InvLocation.is_active == is_active)

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar()

    locs_result = await db.execute(q.order_by(InvLocation.code).offset(skip).limit(limit))
    locs = locs_result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(l) for l in locs],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=InvLocationResponse, status_code=status.HTTP_201_CREATED)
async def create_location(
    data: InvLocationCreate,
    current_user: User = Depends(require_role("Admin", "Warehouse")),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(InvLocation).where(InvLocation.code == data.code))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Location code '{data.code}' already exists"
        )
    loc = InvLocation(**data.model_dump())
    db.add(loc)
    await db.flush()
    await db.refresh(loc)
    return _to_response(loc)


@router.get("/{loc_id}", response_model=InvLocationResponse)
async def get_location(
    loc_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(InvLocation).where(InvLocation.id == loc_id))
    loc = result.scalar_one_or_none()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return _to_response(loc)


@router.patch("/{loc_id}", response_model=InvLocationResponse)
async def update_location(
    loc_id: int,
    data: InvLocationUpdate,
    current_user: User = Depends(require_role("Admin", "Warehouse")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(InvLocation).where(InvLocation.id == loc_id))
    loc = result.scalar_one_or_none()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(loc, field, value)
    await db.flush()
    await db.refresh(loc)
    return _to_response(loc)
