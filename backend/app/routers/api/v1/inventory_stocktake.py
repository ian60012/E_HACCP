"""Inventory stocktake router (盤點)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from decimal import Decimal

from app.core.database import get_db
from app.models.inventory import InvStocktake, InvStocktakeLine, InvLocation
from app.models.user import User
from app.schemas.inventory import (
    InvStocktakeCreate, InvStocktakeLineUpdate,
    InvStocktakeLineResponse, InvStocktakeResponse,
)
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user
from app.services.inventory_service import create_stocktake, confirm_stocktake

router = APIRouter(prefix="/inventory/stocktakes", tags=["inventory-stocktake"])


def _line_response(line: InvStocktakeLine) -> InvStocktakeLineResponse:
    variance = None
    if line.physical_qty is not None:
        variance = line.physical_qty - line.system_qty
    return InvStocktakeLineResponse(
        id=line.id,
        item_id=line.item_id,
        item_code=line.item.code,
        item_name=line.item.name,
        item_unit=line.item.base_unit,
        location_id=line.location_id,
        system_qty=line.system_qty,
        physical_qty=line.physical_qty,
        variance=variance,
        notes=line.notes,
    )


def _to_response(st: InvStocktake) -> InvStocktakeResponse:
    st_status = st.status.value if hasattr(st.status, "value") else st.status
    return InvStocktakeResponse(
        id=st.id,
        doc_number=st.doc_number,
        status=st_status,
        location_id=st.location_id,
        location_name=st.location.name,
        count_date=st.count_date,
        notes=st.notes,
        operator_id=st.operator_id,
        confirmed_at=st.confirmed_at,
        adj_in_doc_id=st.adj_in_doc_id,
        adj_out_doc_id=st.adj_out_doc_id,
        created_at=st.created_at,
        lines=[_line_response(l) for l in (st.lines or [])],
    )


def _base_query():
    return select(InvStocktake).options(
        selectinload(InvStocktake.location),
        selectinload(InvStocktake.lines).selectinload(InvStocktakeLine.item),
    )


@router.get("", response_model=PaginatedResponse[InvStocktakeResponse])
async def list_stocktakes(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    location_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    q = _base_query()
    filters = []
    if status_filter:
        filters.append(InvStocktake.status == status_filter)
    if location_id:
        filters.append(InvStocktake.location_id == location_id)
    if filters:
        q = q.where(*filters)

    total_result = await db.execute(
        select(func.count()).select_from(
            select(InvStocktake).where(*filters).subquery()
        )
    )
    total = total_result.scalar()

    result = await db.execute(
        q.order_by(InvStocktake.created_at.desc()).offset(skip).limit(limit)
    )
    items = result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(s) for s in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=InvStocktakeResponse, status_code=status.HTTP_201_CREATED)
async def create_stocktake_endpoint(
    data: InvStocktakeCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stocktake = await create_stocktake(
        db,
        location_id=data.location_id,
        count_date=data.count_date,
        notes=data.notes,
        operator_id=current_user.id,
    )
    await db.commit()
    result = await db.execute(_base_query().where(InvStocktake.id == stocktake.id))
    return _to_response(result.scalar_one())


@router.get("/{stocktake_id}", response_model=InvStocktakeResponse)
async def get_stocktake(
    stocktake_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(_base_query().where(InvStocktake.id == stocktake_id))
    st = result.scalar_one_or_none()
    if not st:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stocktake not found")
    return _to_response(st)


@router.patch("/{stocktake_id}/lines/{line_id}", response_model=InvStocktakeLineResponse)
async def update_stocktake_line(
    stocktake_id: int,
    line_id: int,
    data: InvStocktakeLineUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InvStocktakeLine)
        .options(
            selectinload(InvStocktakeLine.item),
            selectinload(InvStocktakeLine.stocktake),
        )
        .where(
            InvStocktakeLine.id == line_id,
            InvStocktakeLine.stocktake_id == stocktake_id,
        )
    )
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line not found")

    st_status = line.stocktake.status.value if hasattr(line.stocktake.status, "value") else line.stocktake.status
    if st_status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit a confirmed stocktake"
        )

    if "physical_qty" in data.model_fields_set or data.physical_qty is not None:
        line.physical_qty = data.physical_qty
    if data.notes is not None:
        line.notes = data.notes

    await db.commit()
    # Reload with item
    result = await db.execute(
        select(InvStocktakeLine)
        .options(selectinload(InvStocktakeLine.item))
        .where(InvStocktakeLine.id == line_id)
    )
    line = result.scalar_one()
    return _line_response(line)


@router.post("/{stocktake_id}/confirm", response_model=InvStocktakeResponse)
async def confirm_stocktake_endpoint(
    stocktake_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await confirm_stocktake(db, stocktake_id, current_user.id)
    await db.commit()
    result = await db.execute(_base_query().where(InvStocktake.id == stocktake_id))
    return _to_response(result.scalar_one())
