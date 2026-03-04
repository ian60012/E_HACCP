"""Inventory items router (品項管理)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.inventory import InvItem
from app.models.user import User
from app.schemas.inventory import InvItemCreate, InvItemUpdate, InvItemResponse
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
    )


@router.get("", response_model=PaginatedResponse[InvItemResponse])
async def list_items(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    is_active: Optional[bool] = True,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(InvItem).options(selectinload(InvItem.supplier))
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
    item = InvItem(**data.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    # Reload with supplier
    result = await db.execute(
        select(InvItem).options(selectinload(InvItem.supplier)).where(InvItem.id == item.id)
    )
    return _to_response(result.scalar_one())


@router.get("/{item_id}", response_model=InvItemResponse)
async def get_item(
    item_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InvItem).options(selectinload(InvItem.supplier)).where(InvItem.id == item_id)
    )
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
    result = await db.execute(
        select(InvItem).options(selectinload(InvItem.supplier)).where(InvItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    # Reload supplier
    result2 = await db.execute(
        select(InvItem).options(selectinload(InvItem.supplier)).where(InvItem.id == item_id)
    )
    return _to_response(result2.scalar_one())
