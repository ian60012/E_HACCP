"""Inventory balance and movements router (庫存查詢)."""

from collections import defaultdict
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.inventory import InvStockBalance, InvStockMovement, InvItem, InvLocation
from app.models.user import User
from app.schemas.inventory import InvStockBalanceResponse, InvStockMovementResponse, InvLotBalance
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
        selectinload(InvStockBalance.lot),
    )
    if item_id:
        q = q.where(InvStockBalance.item_id == item_id)
    if location_id:
        q = q.where(InvStockBalance.location_id == location_id)

    rows_result = await db.execute(q.order_by(InvStockBalance.item_id, InvStockBalance.location_id, InvStockBalance.lot_id))
    rows = rows_result.scalars().all()
    grouped = {}
    for r in rows:
        key = (r.item_id, r.location_id)
        if key not in grouped:
            grouped[key] = InvStockBalanceResponse(
            item_id=r.item_id,
            item_code=r.item.code if r.item else None,
            item_name=r.item.name if r.item else None,
            item_category=r.item.category if r.item else None,
            base_unit=r.item.base_unit if r.item else None,
            location_id=r.location_id,
            location_code=r.location.code if r.location else None,
            location_name=r.location.name if r.location else None,
            quantity=Decimal("0"),
            lot_tracking_enabled=bool(r.item and r.item.lot_tracking_enabled),
            lots=[],
        )
        grouped[key].quantity += r.quantity
        if r.lot:
            grouped[key].lots.append(InvLotBalance(
                lot_id=r.lot.id, lot_code=r.lot.lot_code, origin_type=r.lot.origin_type,
                is_system_generated=r.lot.is_system_generated, quantity=r.quantity,
            ))
    all_items = list(grouped.values())
    return PaginatedResponse(items=all_items[skip:skip + limit], total=len(all_items), skip=skip, limit=limit)


@router.get("/by-location", response_model=PaginatedResponse[InvStockBalanceResponse])
async def list_balance_by_location(
    location_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return active items × their allowed locations with balance (0 if no movement).
    If location_id is provided, only that location's rows are returned.
    Items with no allowed locations are omitted.
    """
    # Load active items with their allowed_locations
    items_result = await db.execute(
        select(InvItem)
        .options(selectinload(InvItem.allowed_locations))
        .where(InvItem.is_active == True)
        .order_by(InvItem.code)
    )
    all_items = items_result.scalars().all()

    # Fetch all existing balance rows in one query
    bal_q = select(InvStockBalance).options(selectinload(InvStockBalance.lot))
    if location_id:
        bal_q = bal_q.where(InvStockBalance.location_id == location_id)
    bal_result = await db.execute(bal_q)
    bal_map = defaultdict(list)
    for balance in bal_result.scalars().all():
        bal_map[(balance.item_id, balance.location_id)].append(balance)

    rows = []
    for item in all_items:
        allowed = item.allowed_locations
        if not allowed:
            continue
        if location_id:
            allowed = [loc for loc in allowed if loc.id == location_id]
        for loc in sorted(allowed, key=lambda l: l.code):
            balances = bal_map.get((item.id, loc.id), [])
            qty = sum((b.quantity for b in balances), Decimal("0"))
            rows.append(InvStockBalanceResponse(
                item_id=item.id,
                item_code=item.code,
                item_name=item.name,
                item_category=item.category,
                base_unit=item.base_unit,
                location_id=loc.id,
                location_code=loc.code,
                location_name=loc.name,
                quantity=qty,
                lot_tracking_enabled=item.lot_tracking_enabled,
                lots=[InvLotBalance(
                    lot_id=b.lot.id, lot_code=b.lot.lot_code, origin_type=b.lot.origin_type,
                    is_system_generated=b.lot.is_system_generated, quantity=b.quantity,
                ) for b in balances if b.lot],
            ))

    return PaginatedResponse(items=rows, total=len(rows), skip=0, limit=len(rows))


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
        selectinload(InvStockMovement.lot),
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
            lot_id=r.lot_id,
            lot_code=r.lot.lot_code if r.lot else None,
        )
        for r in rows
    ]

    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)
