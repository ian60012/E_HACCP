"""Production batches router (生產批次)."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.production import (
    ProdBatch,
    ProdProduct,
    ProdFormingTrolley,
    ProdPackingRecord,
    ProdPackingTrim,
    ProdHotInput,
)
from app.models.inventory import InvItem
from app.models.user import User
from app.schemas.production import (
    ProdBatchCreate,
    ProdBatchUpdate,
    ProdBatchResponse,
    ProdFormingTrolleyCreate,
    ProdFormingTrolleyResponse,
    ProdPackingSaveRequest,
    ProdPackingRecordResponse,
    ProdPackingTrimResponse,
    FormingTotalsResponse,
    PackingTotalsResponse,
    HotProcessBalanceResponse,
    EnterStockRequest,
    ProdHotInputCreate,
    ProdHotInputResponse,
)
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user, require_role
from app.services.production_service import (
    generate_batch_code,
    calculate_trolley_metrics,
    calculate_forming_totals,
    calculate_packing_totals,
    calculate_hot_process_balance,
    enter_batch_to_inventory,
)

router = APIRouter(prefix="/production/batches", tags=["Production Batches"])


def _trolley_response(t: ProdFormingTrolley) -> ProdFormingTrolleyResponse:
    return ProdFormingTrolleyResponse(
        id=t.id,
        batch_id=t.batch_id,
        trolley_no=t.trolley_no,
        sampled_tray_count=t.sampled_tray_count,
        sampled_gross_weight_sum_kg=t.sampled_gross_weight_sum_kg,
        tray_tare_weight_kg=t.tray_tare_weight_kg,
        total_trays_on_trolley=t.total_trays_on_trolley,
        partial_trays_count=t.partial_trays_count,
        partial_fill_ratio=t.partial_fill_ratio,
        avg_tray_net_weight_kg=t.avg_tray_net_weight_kg,
        equivalent_tray_count=t.equivalent_tray_count,
        estimated_net_weight_kg=t.estimated_net_weight_kg,
        remark=t.remark,
    )


def _packing_record_response(r: ProdPackingRecord) -> ProdPackingRecordResponse:
    return ProdPackingRecordResponse(
        id=r.id,
        batch_id=r.batch_id,
        pack_type=r.pack_type.value if hasattr(r.pack_type, "value") else r.pack_type,
        product_id=r.product_id,
        product_name=r.product.name if r.product else None,
        inv_item_id=r.inv_item_id,
        inv_item_name=r.inv_item.name if r.inv_item else None,
        bag_count=r.bag_count,
        nominal_weight_kg=r.nominal_weight_kg,
        theoretical_total_weight_kg=r.theoretical_total_weight_kg,
        remark=r.remark,
    )


def _packing_trim_response(t: ProdPackingTrim) -> ProdPackingTrimResponse:
    return ProdPackingTrimResponse(
        id=t.id,
        batch_id=t.batch_id,
        trim_type=t.trim_type,
        weight_kg=t.weight_kg,
        remark=t.remark,
    )


def _to_response(batch: ProdBatch) -> ProdBatchResponse:
    return ProdBatchResponse(
        id=batch.id,
        batch_code=batch.batch_code,
        product_code=batch.product_code,
        product_name=batch.product_name,
        production_date=batch.production_date,
        shift=batch.shift.value if hasattr(batch.shift, "value") and batch.shift else batch.shift,
        spec_piece_weight_g=batch.spec_piece_weight_g,
        start_time=batch.start_time,
        end_time=batch.end_time,
        status=batch.status.value if hasattr(batch.status, "value") else batch.status,
        operator=batch.operator,
        supervisor=batch.supervisor,
        estimated_forming_net_weight_kg=batch.estimated_forming_net_weight_kg,
        estimated_forming_pieces=batch.estimated_forming_pieces,
        input_weight_kg=batch.input_weight_kg,
        inv_stock_doc_id=batch.inv_stock_doc_id,
        created_at=batch.created_at,
        trolleys=[_trolley_response(t) for t in (batch.forming_trolleys or [])],
        packing_records=[_packing_record_response(r) for r in (batch.packing_records or [])],
        packing_trims=[_packing_trim_response(t) for t in (batch.packing_trims or [])],
        hot_inputs=[_hot_input_response(h) for h in (batch.hot_inputs or [])],
    )


def _hot_input_response(h: ProdHotInput) -> ProdHotInputResponse:
    return ProdHotInputResponse(
        id=h.id,
        prod_batch_id=h.prod_batch_id,
        seq=h.seq,
        weight_kg=h.weight_kg,
        notes=h.notes,
        created_at=h.created_at,
    )


def _base_query():
    return select(ProdBatch).options(
        selectinload(ProdBatch.forming_trolleys),
        selectinload(ProdBatch.packing_records).selectinload(ProdPackingRecord.product),
        selectinload(ProdBatch.packing_records).selectinload(ProdPackingRecord.inv_item),
        selectinload(ProdBatch.packing_trims),
        selectinload(ProdBatch.hot_inputs),
    )


@router.get("", response_model=PaginatedResponse[ProdBatchResponse])
async def list_batches(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
    status_filter: Optional[str] = Query(None, alias="status"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    product_type: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    q = _base_query()
    filters = []
    if status_filter:
        q = q.where(ProdBatch.status == status_filter)
        filters.append(ProdBatch.status == status_filter)
    if date_from:
        q = q.where(ProdBatch.production_date >= date_from)
        filters.append(ProdBatch.production_date >= date_from)
    if date_to:
        q = q.where(ProdBatch.production_date <= date_to)
        filters.append(ProdBatch.production_date <= date_to)
    if product_type:
        q = q.join(ProdProduct, ProdBatch.product_code == ProdProduct.code).where(
            ProdProduct.product_type == product_type
        )
        filters.append(
            ProdBatch.product_code.in_(
                select(ProdProduct.code).where(ProdProduct.product_type == product_type)
            )
        )

    count_q = select(func.count()).select_from(
        select(ProdBatch).where(*filters).subquery()
    )
    total_result = await db.execute(count_q)
    total = total_result.scalar()

    batches_result = await db.execute(
        q.order_by(ProdBatch.created_at.desc()).offset(skip).limit(limit)
    )
    batches = batches_result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(b) for b in batches],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post(
    "", response_model=ProdBatchResponse, status_code=status.HTTP_201_CREATED
)
async def create_batch(
    data: ProdBatchCreate,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    batch_code = await generate_batch_code(
        db, data.product_code, data.production_date
    )
    batch = ProdBatch(
        batch_code=batch_code,
        product_code=data.product_code,
        product_name=data.product_name,
        production_date=data.production_date,
        shift=data.shift,
        spec_piece_weight_g=data.spec_piece_weight_g,
        start_time=data.start_time,
        operator=data.operator,
        supervisor=data.supervisor,
    )
    db.add(batch)
    await db.flush()
    await db.commit()

    result = await db.execute(_base_query().where(ProdBatch.id == batch.id))
    return _to_response(result.scalar_one())


@router.get("/{batch_id}", response_model=ProdBatchResponse)
async def get_batch(
    batch_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(_base_query().where(ProdBatch.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found"
        )
    return _to_response(batch)


@router.patch("/{batch_id}", response_model=ProdBatchResponse)
async def update_batch(
    batch_id: int,
    data: ProdBatchUpdate,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(_base_query().where(ProdBatch.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found"
        )
    batch_status = batch.status.value if hasattr(batch.status, "value") else batch.status
    if batch_status != "open":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only update batches with status 'open'",
        )
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(batch, field, value)
    await db.flush()
    await db.commit()

    result2 = await db.execute(_base_query().where(ProdBatch.id == batch_id))
    return _to_response(result2.scalar_one())


# ---------------------------------------------------------------------------
# Trolleys
# ---------------------------------------------------------------------------


@router.post(
    "/{batch_id}/trolleys",
    response_model=ProdFormingTrolleyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_trolley(
    batch_id: int,
    data: ProdFormingTrolleyCreate,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    batch = await db.get(ProdBatch, batch_id)
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found"
        )

    metrics = calculate_trolley_metrics(
        sampled_tray_count=data.sampled_tray_count,
        sampled_gross_weight_sum_kg=data.sampled_gross_weight_sum_kg,
        tray_tare_weight_kg=data.tray_tare_weight_kg,
        total_trays_on_trolley=data.total_trays_on_trolley,
        partial_trays_count=data.partial_trays_count,
        partial_fill_ratio=data.partial_fill_ratio,
    )

    trolley = ProdFormingTrolley(
        batch_id=batch_id,
        trolley_no=data.trolley_no,
        sampled_tray_count=data.sampled_tray_count,
        sampled_gross_weight_sum_kg=data.sampled_gross_weight_sum_kg,
        tray_tare_weight_kg=data.tray_tare_weight_kg,
        total_trays_on_trolley=data.total_trays_on_trolley,
        partial_trays_count=data.partial_trays_count,
        partial_fill_ratio=data.partial_fill_ratio,
        avg_tray_net_weight_kg=metrics["avg_tray_net_weight_kg"],
        equivalent_tray_count=metrics["equivalent_tray_count"],
        estimated_net_weight_kg=metrics["estimated_net_weight_kg"],
        remark=data.remark,
    )
    db.add(trolley)
    await db.flush()
    await db.refresh(trolley)

    # Recalculate forming totals
    await calculate_forming_totals(db, batch_id)
    await db.commit()

    return _trolley_response(trolley)


@router.delete("/{batch_id}/trolleys/{trolley_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_trolley(
    batch_id: int,
    trolley_id: int,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProdFormingTrolley).where(
            ProdFormingTrolley.id == trolley_id,
            ProdFormingTrolley.batch_id == batch_id,
        )
    )
    trolley = result.scalar_one_or_none()
    if not trolley:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trolley not found"
        )
    await db.delete(trolley)
    await db.flush()

    # Recalculate forming totals
    await calculate_forming_totals(db, batch_id)
    await db.commit()


# ---------------------------------------------------------------------------
# Hot inputs (多次投料)
# ---------------------------------------------------------------------------


@router.post(
    "/{batch_id}/hot-inputs",
    response_model=ProdBatchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_hot_input(
    batch_id: int,
    data: ProdHotInputCreate,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    batch = await db.get(ProdBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")

    # Auto-increment seq per batch
    seq_result = await db.execute(
        select(func.max(ProdHotInput.seq)).where(ProdHotInput.prod_batch_id == batch_id)
    )
    next_seq = (seq_result.scalar() or 0) + 1

    hot_input = ProdHotInput(
        prod_batch_id=batch_id,
        seq=next_seq,
        weight_kg=data.weight_kg,
        notes=data.notes,
    )
    db.add(hot_input)
    await db.flush()
    await db.commit()

    result = await db.execute(_base_query().where(ProdBatch.id == batch_id))
    return _to_response(result.scalar_one())


@router.delete("/{batch_id}/hot-inputs/{input_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_hot_input(
    batch_id: int,
    input_id: int,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProdHotInput).where(
            ProdHotInput.id == input_id,
            ProdHotInput.prod_batch_id == batch_id,
        )
    )
    hot_input = result.scalar_one_or_none()
    if not hot_input:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hot input not found")
    await db.delete(hot_input)
    await db.commit()


# ---------------------------------------------------------------------------
# Forming totals
# ---------------------------------------------------------------------------


@router.get("/{batch_id}/forming-totals", response_model=FormingTotalsResponse)
async def get_forming_totals(
    batch_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    totals = await calculate_forming_totals(db, batch_id)
    if totals is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found"
        )
    return FormingTotalsResponse(**totals)


# ---------------------------------------------------------------------------
# Packing
# ---------------------------------------------------------------------------


@router.post("/{batch_id}/packing", response_model=ProdBatchResponse)
async def save_packing(
    batch_id: int,
    data: ProdPackingSaveRequest,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    batch = await db.get(ProdBatch, batch_id)
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found"
        )

    # Delete existing packing records and trims for this batch
    await db.execute(
        delete(ProdPackingRecord).where(ProdPackingRecord.batch_id == batch_id)
    )
    await db.execute(
        delete(ProdPackingTrim).where(ProdPackingTrim.batch_id == batch_id)
    )

    # Insert new packing records
    for rec_data in data.records:
        record = ProdPackingRecord(
            batch_id=batch_id,
            pack_type=rec_data.pack_type,
            product_id=rec_data.product_id,
            inv_item_id=rec_data.inv_item_id,
            bag_count=rec_data.bag_count,
            nominal_weight_kg=rec_data.nominal_weight_kg,
            theoretical_total_weight_kg=rec_data.bag_count * rec_data.nominal_weight_kg,
            remark=rec_data.remark,
        )
        db.add(record)

    # Insert new packing trims
    for trim_data in data.trims:
        trim = ProdPackingTrim(
            batch_id=batch_id,
            trim_type=trim_data.trim_type,
            weight_kg=trim_data.weight_kg,
            remark=trim_data.remark,
        )
        db.add(trim)

    # Set batch status to packed (editable until enter-stock)
    batch.status = "packed"
    await db.flush()
    await db.commit()

    # Reload batch with all relations
    result = await db.execute(_base_query().where(ProdBatch.id == batch_id))
    return _to_response(result.scalar_one())


@router.get("/{batch_id}/packing-totals", response_model=PackingTotalsResponse)
async def get_packing_totals(
    batch_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    totals = await calculate_packing_totals(db, batch_id)
    if totals is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found"
        )
    return PackingTotalsResponse(**totals)


# ---------------------------------------------------------------------------
# Hot-process balance
# ---------------------------------------------------------------------------


@router.get("/{batch_id}/hot-process-balance", response_model=HotProcessBalanceResponse)
async def get_hot_process_balance(
    batch_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    balance = await calculate_hot_process_balance(db, batch_id)
    if balance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found"
        )
    return HotProcessBalanceResponse(**balance)


@router.post("/{batch_id}/enter-stock", response_model=ProdBatchResponse)
async def enter_stock(
    batch_id: int,
    data: EnterStockRequest,
    current_user: User = Depends(require_role("Admin", "Production", "Warehouse")),
    db: AsyncSession = Depends(get_db),
):
    await enter_batch_to_inventory(db, batch_id, data.location_id, current_user.id)
    await db.commit()
    result = await db.execute(_base_query().where(ProdBatch.id == batch_id))
    return _to_response(result.scalar_one())
