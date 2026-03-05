"""Production products router (產品管理)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.production import ProdProduct
from app.models.user import User
from app.schemas.production import (
    ProdProductCreate,
    ProdProductUpdate,
    ProdProductResponse,
    FormingOption,
)
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user

router = APIRouter(prefix="/production/products", tags=["Production Products"])


def _to_response(product: ProdProduct) -> ProdProductResponse:
    return ProdProductResponse(
        id=product.id,
        code=product.code,
        name=product.name,
        pack_size_kg=product.pack_size_kg,
        loss_rate_warn_pct=product.loss_rate_warn_pct,
        product_type=product.product_type.value if hasattr(product.product_type, "value") else (product.product_type or "forming"),
        inv_item_id=product.inv_item_id,
        is_active=product.is_active,
        created_at=product.created_at,
    )


@router.get("", response_model=PaginatedResponse[ProdProductResponse])
async def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    show_inactive: bool = False,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(ProdProduct)
    if not show_inactive:
        q = q.where(ProdProduct.is_active == True)  # noqa: E712
    if search:
        q = q.where(
            ProdProduct.name.ilike(f"%{search}%")
            | ProdProduct.code.ilike(f"%{search}%")
        )

    total_result = await db.execute(
        select(func.count()).select_from(q.subquery())
    )
    total = total_result.scalar()

    items_result = await db.execute(
        q.order_by(ProdProduct.code).offset(skip).limit(limit)
    )
    items = items_result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(p) for p in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post(
    "", response_model=ProdProductResponse, status_code=status.HTTP_201_CREATED
)
async def create_product(
    data: ProdProductCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(ProdProduct).where(ProdProduct.code == data.code)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Product code '{data.code}' already exists",
        )
    product = ProdProduct(**data.model_dump())
    db.add(product)
    await db.flush()
    await db.commit()
    await db.refresh(product)
    return _to_response(product)


@router.get("/forming-options", response_model=list[FormingOption])
async def get_forming_options(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProdProduct)
        .where(ProdProduct.is_active == True)  # noqa: E712
        .order_by(ProdProduct.code)
    )
    products = result.scalars().all()
    return [
        FormingOption(
            id=p.id,
            code=p.code,
            name=p.name,
            product_type=p.product_type.value if hasattr(p.product_type, "value") else (p.product_type or "forming"),
            pack_size_kg=p.pack_size_kg,
            loss_rate_warn_pct=p.loss_rate_warn_pct,
        )
        for p in products
    ]


@router.get("/{product_id}", response_model=ProdProductResponse)
async def get_product(
    product_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProdProduct).where(ProdProduct.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )
    return _to_response(product)


@router.patch("/{product_id}", response_model=ProdProductResponse)
async def update_product(
    product_id: int,
    data: ProdProductUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProdProduct).where(ProdProduct.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    await db.flush()
    await db.commit()
    await db.refresh(product)
    return _to_response(product)
