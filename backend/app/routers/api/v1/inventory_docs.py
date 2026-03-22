"""Inventory stock documents router (入出庫單)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.inventory import InvStockDoc, InvStockLine, InvItem, InvLocation
from app.models.enums import InvDocType, InvDocStatus
from app.models.user import User
from app.schemas.inventory import (
    InvStockDocCreate, InvStockDocVoidRequest,
    InvStockDocResponse, InvStockLineResponse,
)
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user
from app.services.inventory_service import (
    generate_doc_number, post_document, void_document
)

router = APIRouter(prefix="/inventory/docs", tags=["inventory-docs"])


def _line_response(line: InvStockLine) -> InvStockLineResponse:
    return InvStockLineResponse(
        id=line.id,
        doc_id=line.doc_id,
        item_id=line.item_id,
        item_code=line.item.code if line.item else None,
        item_name=line.item.name if line.item else None,
        location_id=line.location_id,
        location_name=line.location.name if line.location else None,
        quantity=line.quantity,
        unit=line.unit,
        unit_cost=line.unit_cost,
        notes=line.notes,
    )


def _to_response(doc: InvStockDoc) -> InvStockDocResponse:
    return InvStockDocResponse(
        id=doc.id,
        doc_number=doc.doc_number,
        doc_type=doc.doc_type.value if doc.doc_type else doc.doc_type,
        status=doc.status.value if doc.status else doc.status,
        location_id=doc.location_id,
        location_name=doc.location.name if doc.location else None,
        receiving_log_id=doc.receiving_log_id,
        ref_number=doc.ref_number,
        notes=doc.notes,
        void_reason=doc.void_reason,
        operator_id=doc.operator_id,
        operator_name=doc.operator_name,
        created_at=doc.created_at,
        posted_at=doc.posted_at,
        voided_at=doc.voided_at,
        lines=[_line_response(l) for l in (doc.lines or [])],
    )


def _base_query():
    return select(InvStockDoc).options(
        selectinload(InvStockDoc.location),
        selectinload(InvStockDoc.lines).selectinload(InvStockLine.item),
        selectinload(InvStockDoc.lines).selectinload(InvStockLine.location),
    )


@router.get("", response_model=PaginatedResponse[InvStockDocResponse])
async def list_docs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
    doc_type: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    q = _base_query()
    if doc_type:
        q = q.where(InvStockDoc.doc_type == doc_type)
    if status_filter:
        q = q.where(InvStockDoc.status == status_filter)

    total_result = await db.execute(select(func.count()).select_from(
        select(InvStockDoc).where(
            *([InvStockDoc.doc_type == doc_type] if doc_type else []),
            *([InvStockDoc.status == status_filter] if status_filter else []),
        ).subquery()
    ))
    total = total_result.scalar()

    docs_result = await db.execute(
        q.order_by(InvStockDoc.created_at.desc()).offset(skip).limit(limit)
    )
    docs = docs_result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(d) for d in docs],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=InvStockDocResponse, status_code=status.HTTP_201_CREATED)
async def create_doc(
    data: InvStockDocCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if data.doc_type not in ("IN", "OUT"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="doc_type must be 'IN' or 'OUT'"
        )

    doc_number = await generate_doc_number(db, data.doc_type)

    doc = InvStockDoc(
        doc_number=doc_number,
        doc_type=data.doc_type,
        status=InvDocStatus.DRAFT,
        location_id=data.location_id,
        ref_number=data.ref_number,
        notes=data.notes,
        operator_id=current_user.id,
        operator_name=current_user.full_name,
    )
    db.add(doc)
    await db.flush()

    for line_data in data.lines:
        # Validate item exists
        item_result = await db.execute(select(InvItem).where(InvItem.id == line_data.item_id))
        if not item_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item {line_data.item_id} not found"
            )
        line = InvStockLine(
            doc_id=doc.id,
            item_id=line_data.item_id,
            location_id=line_data.location_id,
            quantity=line_data.quantity,
            unit=line_data.unit,
            unit_cost=line_data.unit_cost,
            notes=line_data.notes,
        )
        db.add(line)

    await db.flush()
    await db.commit()

    result = await db.execute(_base_query().where(InvStockDoc.id == doc.id))
    return _to_response(result.scalar_one())


@router.get("/{doc_id}", response_model=InvStockDocResponse)
async def get_doc(
    doc_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(_base_query().where(InvStockDoc.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return _to_response(doc)


@router.post("/{doc_id}/post", response_model=InvStockDocResponse)
async def post_doc(
    doc_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await post_document(db, doc_id, current_user.id)
    await db.commit()
    result = await db.execute(_base_query().where(InvStockDoc.id == doc.id))
    return _to_response(result.scalar_one())


@router.post("/{doc_id}/void", response_model=InvStockDocResponse)
async def void_doc(
    doc_id: int,
    data: InvStockDocVoidRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await void_document(db, doc_id, data.void_reason)
    await db.commit()
    result = await db.execute(_base_query().where(InvStockDoc.id == doc.id))
    return _to_response(result.scalar_one())
