"""Suppliers router — CRUD for supplier management."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.supplier import Supplier
from app.models.user import User
from app.schemas.supplier import SupplierResponse, SupplierCreate, SupplierUpdate
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user, require_role

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("", response_model=PaginatedResponse[SupplierResponse])
async def list_suppliers(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    is_active: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List suppliers with optional active filter."""
    query = select(Supplier)
    count_query = select(func.count(Supplier.id))
    if is_active is not None:
        query = query.where(Supplier.is_active == is_active)
        count_query = count_query.where(Supplier.is_active == is_active)

    total = (await db.execute(count_query)).scalar()
    result = await db.execute(query.order_by(Supplier.name).offset(skip).limit(limit))
    suppliers = result.scalars().all()

    return PaginatedResponse(
        items=[SupplierResponse.model_validate(s) for s in suppliers],
        total=total, skip=skip, limit=limit,
    )


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(
    supplier_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single supplier."""
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    supplier = result.scalar_one_or_none()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return SupplierResponse.model_validate(supplier)


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    data: SupplierCreate,
    current_user: User = Depends(require_role("Admin", "QA")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new supplier (Admin/QA only)."""
    supplier = Supplier(**data.model_dump())
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return SupplierResponse.model_validate(supplier)


@router.patch("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: int,
    data: SupplierUpdate,
    current_user: User = Depends(require_role("Admin", "QA")),
    db: AsyncSession = Depends(get_db),
):
    """Update a supplier (Admin/QA only)."""
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    supplier = result.scalar_one_or_none()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(supplier, field, value)

    await db.commit()
    await db.refresh(supplier)
    return SupplierResponse.model_validate(supplier)
