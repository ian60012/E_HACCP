"""Inventory balance and movements router (庫存查詢)."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.inventory import InvStockBalance, InvStockMovement, InvItem, InvLocation
from app.models.user import User
from app.schemas.inventory import InvStockBalanceResponse, InvStockMovementResponse
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user

router = APIRouter(prefix="/inventory/balance", tags=["inventory-balance"])


@router.get("", response_model=PaginatedResponse[InvStockBalanceResponse])
async def list_balance(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=5000),
    item_id: Optional[int] = None,
    location_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(InvStockBalance).options(
        selectinload(InvStockBalance.item),
        selectinload(InvStockBalance.location),
    )
    if item_id:
        q = q.where(InvStockBalance.item_id == item_id)
    if location_id:
        q = q.where(InvStockBalance.location_id == location_id)

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar()

    rows_result = await db.execute(
        q.order_by(InvStockBalance.item_id, InvStockBalance.location_id)
        .offset(skip).limit(limit)
    )
    rows = rows_result.scalars().all()

    items = [
        InvStockBalanceResponse(
            item_id=r.item_id,
            item_code=r.item.code if r.item else None,
            item_name=r.item.name if r.item else None,
            item_category=r.item.category if r.item else None,
            base_unit=r.item.base_unit if r.item else None,
            location_id=r.location_id,
            location_code=r.location.code if r.location else None,
            location_name=r.location.name if r.location else None,
            quantity=r.quantity,
        )
        for r in rows
    ]

    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/movements", response_model=PaginatedResponse[InvStockMovementResponse])
async def list_movements(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    item_id: Optional[int] = None,
    location_id: Optional[int] = None,
    doc_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(InvStockMovement).options(
        selectinload(InvStockMovement.item),
        selectinload(InvStockMovement.location),
    )
    if item_id:
        q = q.where(InvStockMovement.item_id == item_id)
    if location_id:
        q = q.where(InvStockMovement.location_id == location_id)
    if doc_id:
        q = q.where(InvStockMovement.doc_id == doc_id)

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar()

    rows_result = await db.execute(
        q.order_by(InvStockMovement.created_at.desc()).offset(skip).limit(limit)
    )
    rows = rows_result.scalars().all()

    items = [
        InvStockMovementResponse(
            id=r.id,
            doc_id=r.doc_id,
            item_id=r.item_id,
            item_name=r.item.name if r.item else None,
            location_id=r.location_id,
            location_name=r.location.name if r.location else None,
            delta=r.delta,
            balance_after=r.balance_after,
            created_at=r.created_at,
        )
        for r in rows
    ]

    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)
