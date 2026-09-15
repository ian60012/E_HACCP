"""Inventory stock documents router (入出庫單)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.inventory import InvStockDoc, InvStockLine, InvItem, InvLocation, InvLot
from app.models.enums import InvDocType, InvDocStatus, ItemType
from app.models.user import User
from app.schemas.inventory import (
    InvStockDocCreate, InvStockDocUpdate, InvStockDocVoidRequest,
    InvStockDocResponse, InvStockLineResponse,
)
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user, require_role
from app.services.inventory_service import (
    generate_doc_number, post_document, void_document, validate_document_scope
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
        lot_id=line.lot_id,
        lot_code=line.lot.lot_code if line.lot else None,
        lot_origin_type=line.lot.origin_type if line.lot else None,
    )


def _to_response(doc: InvStockDoc) -> InvStockDocResponse:
    return InvStockDocResponse(
        id=doc.id,
        doc_number=doc.doc_number,
        doc_type=doc.doc_type.value if hasattr(doc.doc_type, 'value') else doc.doc_type,
        item_type_scope=doc.item_type_scope,
        status=doc.status.value if hasattr(doc.status, 'value') else doc.status,
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
        selectinload(InvStockDoc.lines).selectinload(InvStockLine.lot),
    )


async def _resolve_line_lot(db: AsyncSession, item: InvItem, line_data, doc_type: str) -> int | None:
    if not item.lot_tracking_enabled:
        if line_data.lot_id or line_data.new_lot_code:
            raise HTTPException(422, "非批號品項不得指定 lot Lot is not enabled for this item")
        return None
    if line_data.unit.strip().lower() not in ("kg", "公斤"):
        raise HTTPException(422, "批號管理品項的庫存單位必須為 KG Lot-tracked stock unit must be KG")
    if line_data.lot_id and line_data.new_lot_code:
        raise HTTPException(422, "lot_id 與新批號只能擇一 Choose an existing or new lot")
    if doc_type == "OUT" and not line_data.lot_id:
        raise HTTPException(422, "批號品項出庫必須選擇 lot Select a lot for stock OUT")
    if doc_type == "IN" and not line_data.lot_id and not line_data.new_lot_code:
        raise HTTPException(422, "批號品項入庫必須選擇或建立 lot Select or create a lot")
    if line_data.lot_id:
        lot = await db.get(InvLot, line_data.lot_id)
        if not lot or lot.item_id != item.id:
            raise HTTPException(422, "lot 與品項不符 Lot does not belong to the item")
        return lot.id
    lot_code = line_data.new_lot_code.strip()
    if not lot_code:
        raise HTTPException(422, "新批號不可為空 New lot code cannot be blank")
    lot = InvLot(
        item_id=item.id,
        lot_code=lot_code,
        origin_type="manual_adjustment",
        is_system_generated=False,
    )
    db.add(lot)
    await db.flush()
    return lot.id


@router.get("", response_model=PaginatedResponse[InvStockDocResponse])
async def list_docs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
    doc_type: Optional[str] = None,
    item_type_scope: Optional[ItemType] = None,
    general_only: bool = False,
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    q = _base_query()
    if doc_type:
        q = q.where(InvStockDoc.doc_type == doc_type)
    if status_filter:
        q = q.where(InvStockDoc.status == status_filter)
    if general_only:
        q = q.where(InvStockDoc.item_type_scope.is_(None))
    elif item_type_scope is not None:
        q = q.where(InvStockDoc.item_type_scope == item_type_scope)

    total_result = await db.execute(select(func.count()).select_from(
        q.subquery()
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
    current_user: User = Depends(require_role("Admin", "Warehouse")),
    db: AsyncSession = Depends(get_db),
):
    if data.doc_type not in ("IN", "OUT"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="doc_type must be 'IN' or 'OUT'"
        )

    validate_document_scope(data.doc_type, data.item_type_scope)
    doc_number = await generate_doc_number(db, data.doc_type)

    doc = InvStockDoc(
        doc_number=doc_number,
        doc_type=data.doc_type,
        item_type_scope=data.item_type_scope,
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
        item = item_result.scalar_one_or_none()
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item {line_data.item_id} not found"
            )
        validate_document_scope(data.doc_type, data.item_type_scope, item)
        lot_id = await _resolve_line_lot(db, item, line_data, data.doc_type)
        line = InvStockLine(
            doc_id=doc.id,
            item_id=line_data.item_id,
            location_id=line_data.location_id,
            quantity=line_data.quantity,
            unit=line_data.unit,
            unit_cost=line_data.unit_cost,
            notes=line_data.notes,
            lot_id=lot_id,
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


@router.patch("/{doc_id}", response_model=InvStockDocResponse)
async def update_doc(
    doc_id: int,
    data: InvStockDocUpdate,
    current_user: User = Depends(require_role("Admin", "Warehouse")),
    db: AsyncSession = Depends(get_db),
):
    """Update a Draft document (header + replace all lines)."""
    result = await db.execute(
        select(InvStockDoc).where(InvStockDoc.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    doc_status = doc.status.value if hasattr(doc.status, 'value') else str(doc.status)
    if doc_status != "Draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft documents can be edited",
        )

    if "item_type_scope" in data.model_fields_set:
        doc.item_type_scope = data.item_type_scope
    validate_document_scope(doc.doc_type, doc.item_type_scope)

    # Update header fields
    if data.ref_number is not None:
        doc.ref_number = data.ref_number or None
    if data.notes is not None:
        doc.notes = data.notes or None

    # Delete existing lines
    await db.execute(
        delete(InvStockLine).where(InvStockLine.doc_id == doc_id)
    )

    # Insert new lines
    for line_data in data.lines:
        item_result = await db.execute(select(InvItem).where(InvItem.id == line_data.item_id))
        item = item_result.scalar_one_or_none()
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item {line_data.item_id} not found",
            )
        doc_type = doc.doc_type.value if hasattr(doc.doc_type, "value") else doc.doc_type
        validate_document_scope(doc_type, doc.item_type_scope, item)
        lot_id = await _resolve_line_lot(db, item, line_data, doc_type)
        line = InvStockLine(
            doc_id=doc.id,
            item_id=line_data.item_id,
            location_id=line_data.location_id,
            quantity=line_data.quantity,
            unit=line_data.unit,
            unit_cost=line_data.unit_cost,
            notes=line_data.notes,
            lot_id=lot_id,
        )
        db.add(line)

    await db.flush()
    await db.commit()

    result = await db.execute(_base_query().where(InvStockDoc.id == doc.id))
    return _to_response(result.scalar_one())


@router.post("/{doc_id}/post", response_model=InvStockDocResponse)
async def post_doc(
    doc_id: int,
    current_user: User = Depends(require_role("Admin", "Warehouse")),
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
    current_user: User = Depends(require_role("Admin", "Warehouse")),
    db: AsyncSession = Depends(get_db),
):
    from app.models.production import ProdBatch
    meat_batch = await db.scalar(select(ProdBatch.id).where(
        (ProdBatch.inv_stock_doc_id == doc_id) | (ProdBatch.input_stock_doc_id == doc_id),
        ProdBatch.process_type == "meat_processing",
    ))
    if meat_batch:
        raise HTTPException(409, "請從肉品批次作廢並沖回庫存 Void the meat batch to reverse this document")
    # Warehouse can only void Draft docs; Admin can void any status
    user_role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    if user_role == "Warehouse":
        check = await db.execute(select(InvStockDoc).where(InvStockDoc.id == doc_id))
        existing = check.scalar_one_or_none()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        doc_status = existing.status.value if hasattr(existing.status, 'value') else str(existing.status)
        if doc_status != "Draft":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Warehouse role can only void Draft documents. Posted documents require Admin.",
            )

    doc = await void_document(db, doc_id, data.void_reason)
    await db.commit()
    result = await db.execute(_base_query().where(InvStockDoc.id == doc.id))
    return _to_response(result.scalar_one())
