"""
Daily Batch Sheet router (FSP-LOG-017).

Endpoints (under /production/batches):
  GET  /production/batches/{batch_id}/batch-sheet        — Get sheet (null body if none)
  POST /production/batches/{batch_id}/batch-sheet        — Upsert (save all lines)
  POST /production/batches/{batch_id}/batch-sheet/verify — QA lock

Endpoints (under /batch-sheets):
  GET  /batch-sheets  — List recent production batches with sheet status
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, outerjoin
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.batch_sheet import ProdDailyBatchSheet, ProdBatchSheetLine
from app.models.production import ProdBatch
from app.models.receiving_log import ReceivingLog
from app.models.user import User
from app.schemas.batch_sheet import (
    SaveBatchSheetRequest,
    ProdDailyBatchSheetResponse,
    ProdBatchSheetLineResponse,
    ReceivingLogSummary,
    BatchSheetSummaryResponse,
)
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user, require_role

# Router for /production/batches/{id}/batch-sheet endpoints
router = APIRouter(prefix="/production/batches", tags=["batch-sheets"])

# Router for /batch-sheets list endpoint
list_router = APIRouter(prefix="/batch-sheets", tags=["batch-sheets"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _line_to_response(line: ProdBatchSheetLine) -> ProdBatchSheetLineResponse:
    rl_summary = None
    if line.receiving_log:
        rl = line.receiving_log
        rl_summary = ReceivingLogSummary(
            id=rl.id,
            po_number=rl.po_number,
            supplier_name=rl.supplier.name if rl.supplier else None,
            created_at=rl.created_at,
        )
    return ProdBatchSheetLineResponse(
        id=line.id,
        sheet_id=line.sheet_id,
        inv_item_id=line.inv_item_id,
        ingredient_name=line.ingredient_name,
        receiving_log_id=line.receiving_log_id,
        receiving_log=rl_summary,
        supplier=line.supplier,
        supplier_batch_no=line.supplier_batch_no,
        qty_used=line.qty_used,
        unit=line.unit,
        seq=line.seq,
    )


def _sheet_to_response(sheet: ProdDailyBatchSheet) -> ProdDailyBatchSheetResponse:
    return ProdDailyBatchSheetResponse(
        id=sheet.id,
        batch_id=sheet.batch_id,
        operator_id=sheet.operator_id,
        operator_name=sheet.operator_name,
        verified_by=sheet.verified_by,
        verifier_name=sheet.verifier.full_name if sheet.verifier else None,
        verified_at=sheet.verified_at,
        is_locked=sheet.is_locked,
        created_at=sheet.created_at,
        lines=[_line_to_response(l) for l in sheet.lines],
    )


def _base_sheet_query():
    return select(ProdDailyBatchSheet).options(
        selectinload(ProdDailyBatchSheet.operator),
        selectinload(ProdDailyBatchSheet.verifier),
        selectinload(ProdDailyBatchSheet.lines).options(
            selectinload(ProdBatchSheetLine.inv_item),
            selectinload(ProdBatchSheetLine.receiving_log).selectinload(ReceivingLog.supplier),
        ),
    )


async def _get_batch_or_404(batch_id: int, db: AsyncSession) -> ProdBatch:
    result = await db.execute(select(ProdBatch).where(ProdBatch.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


# ---------------------------------------------------------------------------
# List endpoint (/batch-sheets)
# ---------------------------------------------------------------------------

@list_router.get("", response_model=PaginatedResponse[BatchSheetSummaryResponse])
async def list_batch_sheets(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List recent production batches with their batch sheet status."""
    # Count
    count_stmt = (
        select(func.count(ProdBatch.id))
        .where(ProdBatch.is_voided == False)
    )
    total = (await db.execute(count_stmt)).scalar()

    # Main query: batches LEFT JOIN sheets LEFT JOIN lines (count)
    stmt = (
        select(
            ProdBatch.id,
            ProdBatch.batch_code,
            ProdBatch.product_name,
            ProdBatch.production_date,
            ProdDailyBatchSheet.id.label("sheet_id"),
            ProdDailyBatchSheet.is_locked,
            ProdDailyBatchSheet.operator_name,
            ProdDailyBatchSheet.verified_by,
            func.count(ProdBatchSheetLine.id).label("line_count"),
        )
        .select_from(
            outerjoin(ProdBatch, ProdDailyBatchSheet, ProdBatch.id == ProdDailyBatchSheet.batch_id)
            .outerjoin(ProdBatchSheetLine, ProdDailyBatchSheet.id == ProdBatchSheetLine.sheet_id)
        )
        .where(ProdBatch.is_voided == False)
        .group_by(ProdBatch.id, ProdDailyBatchSheet.id)
        .order_by(ProdBatch.production_date.desc(), ProdBatch.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()

    items = [
        BatchSheetSummaryResponse(
            batch_id=row.id,
            batch_code=row.batch_code,
            product_name=row.product_name,
            production_date=row.production_date,
            sheet_id=row.sheet_id,
            has_sheet=row.sheet_id is not None,
            is_locked=bool(row.is_locked),
            line_count=row.line_count or 0,
            operator_name=row.operator_name,
            verified_by=row.verified_by,
        )
        for row in rows
    ]

    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)


# ---------------------------------------------------------------------------
# Per-batch endpoints (/production/batches/{id}/batch-sheet)
# ---------------------------------------------------------------------------

@router.get("/{batch_id}/batch-sheet", response_model=Optional[ProdDailyBatchSheetResponse])
async def get_batch_sheet(
    batch_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the daily batch sheet for a batch. Returns null if not created yet."""
    await _get_batch_or_404(batch_id, db)
    result = await db.execute(
        _base_sheet_query().where(ProdDailyBatchSheet.batch_id == batch_id)
    )
    sheet = result.scalar_one_or_none()
    if not sheet:
        return None
    return _sheet_to_response(sheet)


@router.post("/{batch_id}/batch-sheet", response_model=ProdDailyBatchSheetResponse)
async def save_batch_sheet(
    batch_id: int,
    data: SaveBatchSheetRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Save (upsert) the daily batch sheet lines.
    Replaces all existing lines with the submitted ones.
    Returns 403 if the sheet is already locked.
    """
    await _get_batch_or_404(batch_id, db)

    result = await db.execute(
        select(ProdDailyBatchSheet).where(ProdDailyBatchSheet.batch_id == batch_id)
    )
    sheet = result.scalar_one_or_none()

    if sheet is None:
        sheet = ProdDailyBatchSheet(
            batch_id=batch_id,
            operator_id=current_user.id,
            operator_name=data.operator_name or current_user.full_name,
        )
        db.add(sheet)
        await db.flush()
    else:
        if sheet.is_locked:
            raise HTTPException(status_code=403, detail="Batch sheet is locked and cannot be modified")
        if not sheet.operator_id:
            sheet.operator_id = current_user.id
            sheet.operator_name = data.operator_name or current_user.full_name

    # Replace all lines
    existing = await db.execute(
        select(ProdBatchSheetLine).where(ProdBatchSheetLine.sheet_id == sheet.id)
    )
    for old in existing.scalars().all():
        await db.delete(old)
    await db.flush()

    for line_data in data.lines:
        db.add(ProdBatchSheetLine(
            sheet_id=sheet.id,
            inv_item_id=line_data.inv_item_id,
            ingredient_name=line_data.ingredient_name,
            receiving_log_id=line_data.receiving_log_id,
            supplier=line_data.supplier,
            supplier_batch_no=line_data.supplier_batch_no,
            qty_used=line_data.qty_used,
            unit=line_data.unit,
            seq=line_data.seq,
        ))

    await db.commit()

    result = await db.execute(
        _base_sheet_query().where(ProdDailyBatchSheet.batch_id == batch_id)
    )
    return _sheet_to_response(result.scalar_one())


@router.post("/{batch_id}/batch-sheet/verify", response_model=ProdDailyBatchSheetResponse)
async def verify_batch_sheet(
    batch_id: int,
    current_user: User = Depends(require_role("Admin", "QA")),
    db: AsyncSession = Depends(get_db),
):
    """QA verification: lock the batch sheet. Only Admin/QA roles allowed."""
    await _get_batch_or_404(batch_id, db)

    result = await db.execute(
        select(ProdDailyBatchSheet).where(ProdDailyBatchSheet.batch_id == batch_id)
    )
    sheet = result.scalar_one_or_none()
    if not sheet:
        raise HTTPException(status_code=404, detail="Batch sheet not found. Save it before verifying.")
    if sheet.is_locked:
        raise HTTPException(status_code=400, detail="Batch sheet is already locked")

    sheet.is_locked = True
    sheet.verified_by = current_user.id
    sheet.verified_at = datetime.now(timezone.utc)
    await db.commit()

    result = await db.execute(
        _base_sheet_query().where(ProdDailyBatchSheet.batch_id == batch_id)
    )
    return _sheet_to_response(result.scalar_one())
