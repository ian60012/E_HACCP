"""Inventory items router (品項管理)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.inventory import InvItem, InvLocation
from app.models.user import User
from app.schemas.inventory import (
    InvItemCreate, InvItemUpdate, InvItemResponse,
    InvAllowedLocationsUpdate,
)
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user

router = APIRouter(prefix="/inventory/items", tags=["inventory-items"])


def _to_response(item: InvItem) -> InvItemResponse:
    return InvItemResponse(
        id=item.id,
        code=item.code,
        name=item.name,
        category=item.category,
        base_unit=item.base_unit,
        description=item.description,
        supplier_id=item.supplier_id,
        supplier_name=item.supplier.name if item.supplier else None,
        is_active=item.is_active,
        created_at=item.created_at,
        allowed_location_ids=[loc.id for loc in item.allowed_locations],
    )


def _base_item_query():
    return select(InvItem).options(
        selectinload(InvItem.supplier),
        selectinload(InvItem.allowed_locations),
    )


async def _set_allowed_locations(db: AsyncSession, item: InvItem, location_ids: list[int]):
    """Replace item's allowed locations with the given list."""
    if location_ids:
        locs_result = await db.execute(
            select(InvLocation).where(InvLocation.id.in_(location_ids))
        )
        locs = locs_result.scalars().all()
        if len(locs) != len(location_ids):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="One or more location IDs not found"
            )
        item.allowed_locations = locs
    else:
        item.allowed_locations = []


@router.get("", response_model=PaginatedResponse[InvItemResponse])
async def list_items(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    is_active: Optional[bool] = True,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    q = _base_item_query()
    if is_active is not None:
        q = q.where(InvItem.is_active == is_active)
    if search:
        q = q.where(
            InvItem.name.ilike(f"%{search}%") | InvItem.code.ilike(f"%{search}%")
        )

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar()

    items_result = await db.execute(q.order_by(InvItem.code).offset(skip).limit(limit))
    items = items_result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(i) for i in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=InvItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(
    data: InvItemCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(InvItem).where(InvItem.code == data.code))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Item code '{data.code}' already exists"
        )
    dump = data.model_dump(exclude={"allowed_location_ids"})
    item = InvItem(**dump)
    db.add(item)
    await db.flush()

    # Reload with relationships before assigning allowed_locations
    result = await db.execute(_base_item_query().where(InvItem.id == item.id))
    item = result.scalar_one()

    if data.allowed_location_ids is not None:
        await _set_allowed_locations(db, item, data.allowed_location_ids)
        await db.flush()

    await db.commit()
    result2 = await db.execute(_base_item_query().where(InvItem.id == item.id))
    return _to_response(result2.scalar_one())


@router.get("/{item_id}", response_model=InvItemResponse)
async def get_item(
    item_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(_base_item_query().where(InvItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return _to_response(item)


@router.patch("/{item_id}", response_model=InvItemResponse)
async def update_item(
    item_id: int,
    data: InvItemUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(_base_item_query().where(InvItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    dump = data.model_dump(exclude_unset=True, exclude={"allowed_location_ids"})
    for field, value in dump.items():
        setattr(item, field, value)

    if data.allowed_location_ids is not None:
        await _set_allowed_locations(db, item, data.allowed_location_ids)

    await db.flush()
    await db.commit()
    result2 = await db.execute(_base_item_query().where(InvItem.id == item_id))
    return _to_response(result2.scalar_one())


@router.put("/{item_id}/allowed-locations", response_model=InvItemResponse)
async def set_allowed_locations(
    item_id: int,
    data: InvAllowedLocationsUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Replace the allowed-location whitelist for an inventory item."""
    result = await db.execute(_base_item_query().where(InvItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    await _set_allowed_locations(db, item, data.location_ids)
    await db.flush()
    await db.commit()

    result2 = await db.execute(_base_item_query().where(InvItem.id == item_id))
    return _to_response(result2.scalar_one())
