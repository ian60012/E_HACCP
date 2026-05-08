"""Production batches router (生產批次)."""

import html
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
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
    CartonLabelRequest,
    FormingTotalsResponse,
    PackingTotalsResponse,
    HotProcessBalanceResponse,
    EnterStockRequest,
    ProdHotInputCreate,
    ProdHotInputResponse,
)
from app.schemas.common import PaginatedResponse, VoidRequest
from app.dependencies.auth import get_current_active_user, require_role
from app.services.production_service import (
    generate_batch_code,
    calculate_trolley_metrics,
    calculate_forming_totals,
    calculate_packing_totals,
    calculate_hot_process_balance,
    enter_batch_to_inventory,
)
from app.services.production_void_service import void_batch as void_batch_service

router = APIRouter(prefix="/production/batches", tags=["Production Batches"])

CODE128_PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
]


def _safe_filename(value: str) -> str:
    return "".join(
        ch if (ch.isascii() and (ch.isalnum() or ch in ("-", "_", "."))) else "_"
        for ch in value
    ).strip("_") or "carton-label"


def _trim_decimal(value: object, decimals: int = 3) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = 0.0
    text = f"{number:.{decimals}f}".rstrip("0").rstrip(".")
    return text or "0"


def _code128_svg(value: str) -> str:
    if not value or any(ord(ch) < 32 or ord(ch) > 126 for ch in value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Batch code must contain printable ASCII characters for barcode generation",
        )
    codes = [104, *[ord(ch) - 32 for ch in value]]
    checksum = codes[0] + sum(code * index for index, code in enumerate(codes[1:], start=1))
    codes.extend([checksum % 103, 106])

    module = 2
    height = 58
    quiet = 16
    x = quiet
    rects: list[str] = []
    for code in codes:
        pattern = CODE128_PATTERNS[code]
        for index, width_char in enumerate(pattern):
            width = int(width_char) * module
            if index % 2 == 0:
                rects.append(f'<rect x="{x}" y="0" width="{width}" height="{height}" />')
            x += width
    width = x + quiet
    escaped_value = html.escape(value)
    return (
        f'<svg class="barcode" viewBox="0 0 {width} 78" xmlns="http://www.w3.org/2000/svg" role="img" '
        f'aria-label="Batch barcode {escaped_value}">'
        f'<rect width="{width}" height="78" fill="#fff" />'
        f'<g fill="#111">{"".join(rects)}</g>'
        f'<text x="{width / 2}" y="75" text-anchor="middle" font-family="Arial, sans-serif" font-size="12">{escaped_value}</text>'
        f'</svg>'
    )


async def _render_pdf(html_content: str, width: str = "100mm", height: str = "75mm") -> bytes:
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PDF renderer is not installed. Install Playwright Chromium in the backend image.",
        ) from exc

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            page = await browser.new_page()
            await page.set_content(html_content, wait_until="load")
            return await page.pdf(
                print_background=True,
                prefer_css_page_size=True,
                width=width,
                height=height,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
        finally:
            await browser.close()


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
        contamination_found=batch.contamination_found,
        change_over=batch.change_over,
        inv_stock_doc_id=batch.inv_stock_doc_id,
        is_voided=batch.is_voided,
        void_reason=batch.void_reason,
        voided_at=batch.voided_at,
        voided_by=batch.voided_by,
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
    product_code: Optional[str] = None,
    include_voided: bool = Query(False),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    q = _base_query()
    filters = []
    if not include_voided:
        q = q.where(ProdBatch.is_voided.is_(False))
        filters.append(ProdBatch.is_voided.is_(False))
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
    if product_code:
        q = q.where(ProdBatch.product_code == product_code)
        filters.append(ProdBatch.product_code == product_code)

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


@router.post("/{batch_id}/carton-label-pdf")
async def carton_label_pdf(
    batch_id: int,
    data: CartonLabelRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(_base_query().where(ProdBatch.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")

    packing_record = next(
        (record for record in (batch.packing_records or []) if record.id == data.packing_record_id),
        None,
    )
    if not packing_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Packing record not found")

    pdf = await _render_pdf(_build_carton_label_html(batch, packing_record, data))
    product_name = packing_record.product.name if packing_record.product else batch.product_name
    filename = _safe_filename(f"{batch.batch_code}-{product_name}-carton-label.pdf")
    return StreamingResponse(
        iter([pdf]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


def _build_carton_label_html(batch: ProdBatch, record: ProdPackingRecord, data: CartonLabelRequest) -> str:
    product_name = record.product.name if record.product else batch.product_name
    pack_type = record.pack_type.value if hasattr(record.pack_type, "value") else record.pack_type
    barcode_svg = _code128_svg(batch.batch_code)
    weight_text = f"{_trim_decimal(record.nominal_weight_kg)} kg"
    total_weight = int(data.bags_per_carton) * float(record.nominal_weight_kg or 0)
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page {{ size: 100mm 75mm; margin: 0; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; width: 100mm; height: 75mm; font-family: Arial, "Microsoft YaHei", sans-serif; color: #111; background: #fff; }}
    .label {{ width: 100mm; height: 75mm; padding: 5mm; display: grid; grid-template-rows: auto 1fr auto; gap: 3mm; }}
    .header {{ border-bottom: 0.45mm solid #111; padding-bottom: 2mm; }}
    .company {{ font-size: 12pt; font-weight: 800; letter-spacing: 0; }}
    .title {{ font-size: 9pt; font-weight: 700; margin-top: 1mm; text-transform: uppercase; }}
    .grid {{ display: grid; grid-template-columns: 29mm 1fr; gap: 1.7mm 3mm; align-content: start; }}
    .key {{ font-size: 7pt; color: #555; font-weight: 700; text-transform: uppercase; }}
    .value {{ font-size: 10pt; font-weight: 800; line-height: 1.12; }}
    .value.large {{ font-size: 13pt; }}
    .barcode-wrap {{ border-top: 0.35mm solid #111; padding-top: 2mm; text-align: center; }}
    .barcode {{ width: 88mm; height: 18mm; display: block; margin: 0 auto; }}
  </style>
</head>
<body>
  <main class="label">
    <section class="header">
      <div class="company">FD CATERING SERVICE PTY LTD</div>
      <div class="title">Carton Label</div>
    </section>
    <section class="grid">
      <div class="key">Batch</div><div class="value large">{html.escape(batch.batch_code)}</div>
      <div class="key">Product</div><div class="value">{html.escape(product_name)}</div>
      <div class="key">Pack Type</div><div class="value">{html.escape(str(pack_type))}</div>
      <div class="key">Bags / Carton</div><div class="value">{data.bags_per_carton}</div>
      <div class="key">Bag Weight</div><div class="value">{html.escape(weight_text)}</div>
      <div class="key">Carton Net</div><div class="value">{_trim_decimal(total_weight)} kg</div>
      <div class="key">Packing Date</div><div class="value">{data.packing_date.isoformat()}</div>
    </section>
    <section class="barcode-wrap">
      {barcode_svg}
    </section>
  </main>
</body>
</html>"""


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


@router.post("/{batch_id}/void", response_model=ProdBatchResponse)
async def void_prod_batch(
    batch_id: int,
    body: VoidRequest,
    current_user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: soft-delete a batch and cascade-void its downstream logs + stock doc."""
    await void_batch_service(db, batch_id, body.void_reason, current_user)
    result = await db.execute(_base_query().where(ProdBatch.id == batch_id))
    return _to_response(result.scalar_one())
