"""Production pack types router (包裝類型管理)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database import get_db
from app.models.production import ProdPackTypeConfig
from app.models.user import User
from app.schemas.production import (
    ProdPackTypeConfigCreate,
    ProdPackTypeConfigUpdate,
    ProdPackTypeConfigResponse,
)
from app.dependencies.auth import get_current_active_user

router = APIRouter(prefix="/production/pack-types", tags=["Production Pack Types"])


def _to_response(pt: ProdPackTypeConfig) -> ProdPackTypeConfigResponse:
    return ProdPackTypeConfigResponse(
        id=pt.id,
        code=pt.code,
        name=pt.name,
        applicable_type=pt.applicable_type,
        nominal_weight_kg=pt.nominal_weight_kg,
        is_active=pt.is_active,
        created_at=pt.created_at,
    )


@router.get("", response_model=list[ProdPackTypeConfigResponse])
async def list_pack_types(
    applicable_type: Optional[str] = None,
    show_inactive: bool = False,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List pack types. Filter by applicable_type (forming/hot_process/both).
    When applicable_type is provided, also includes types with applicable_type='both'."""
    q = select(ProdPackTypeConfig)
    if not show_inactive:
        q = q.where(ProdPackTypeConfig.is_active == True)  # noqa: E712
    if applicable_type:
        q = q.where(
            or_(
                ProdPackTypeConfig.applicable_type == applicable_type,
                ProdPackTypeConfig.applicable_type == "both",
            )
        )
    q = q.order_by(ProdPackTypeConfig.code)
    result = await db.execute(q)
    items = result.scalars().all()
    return [_to_response(pt) for pt in items]


@router.post("", response_model=ProdPackTypeConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_pack_type(
    data: ProdPackTypeConfigCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(ProdPackTypeConfig).where(ProdPackTypeConfig.code == data.code)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Pack type code '{data.code}' already exists",
        )
    pt = ProdPackTypeConfig(**data.model_dump())
    db.add(pt)
    await db.flush()
    await db.commit()
    await db.refresh(pt)
    return _to_response(pt)


@router.patch("/{pack_type_id}", response_model=ProdPackTypeConfigResponse)
async def update_pack_type(
    pack_type_id: int,
    data: ProdPackTypeConfigUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProdPackTypeConfig).where(ProdPackTypeConfig.id == pack_type_id)
    )
    pt = result.scalar_one_or_none()
    if not pt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pack type not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(pt, field, value)
    await db.flush()
    await db.commit()
    await db.refresh(pt)
    return _to_response(pt)
