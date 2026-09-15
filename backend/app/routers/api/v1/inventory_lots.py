"""Read-only inventory lot availability API."""

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.dependencies.auth import get_current_active_user
from app.models.inventory import InvLocation, InvLot, InvStockBalance
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.inventory import InvLotResponse

router = APIRouter(prefix="/inventory/lots", tags=["inventory-lots"])


@router.get("", response_model=PaginatedResponse[InvLotResponse])
async def list_lots(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    item_id: Optional[int] = None,
    location_id: Optional[int] = None,
    positive_only: bool = False,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    join_condition = InvStockBalance.lot_id == InvLot.id
    if location_id is not None:
        join_condition = and_(join_condition, InvStockBalance.location_id == location_id)
    quantity = func.coalesce(func.sum(InvStockBalance.quantity), 0)
    q = (
        select(InvLot, quantity.label("quantity"))
        .outerjoin(InvStockBalance, join_condition)
        .options(selectinload(InvLot.item), selectinload(InvLot.supplier))
        .group_by(InvLot.id)
    )
    if item_id is not None:
        q = q.where(InvLot.item_id == item_id)
    if positive_only:
        q = q.having(quantity > 0)
    count_q = select(func.count()).select_from(q.subquery())
    total = await db.scalar(count_q) or 0
    rows = (await db.execute(q.order_by(InvLot.created_at.desc(), InvLot.id.desc()).offset(skip).limit(limit))).all()
    location = await db.get(InvLocation, location_id) if location_id else None
    items = [InvLotResponse(
        id=lot.id,
        item_id=lot.item_id,
        item_code=lot.item.code if lot.item else None,
        item_name=lot.item.name if lot.item else None,
        lot_code=lot.lot_code,
        origin_type=lot.origin_type,
        is_system_generated=lot.is_system_generated,
        supplier_id=lot.supplier_id,
        supplier_name=lot.supplier.name if lot.supplier else None,
        receiving_log_id=lot.receiving_log_id,
        prod_batch_id=lot.prod_batch_id,
        location_id=location_id,
        location_name=location.name if location else None,
        quantity=qty if qty is not None else Decimal("0"),
        created_at=lot.created_at,
    ) for lot, qty in rows]
    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)
