"""
Daily Batch Sheet router (FSP-LOG-017).

Endpoints:
  GET  /production/batches/{batch_id}/batch-sheet        — Get or auto-init sheet
  POST /production/batches/{batch_id}/batch-sheet        — Upsert (save all lines)
  POST /production/batches/{batch_id}/batch-sheet/verify — QA lock
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.batch_sheet import ProdDailyBatchSheet, ProdBatchSheetLine
from app.models.inventory import InvItem
from app.models.production import ProdBatch
from app.models.receiving_log import ReceivingLog
from app.models.user import User
from app.schemas.batch_sheet import (
    SaveBatchSheetRequest,
    ProdDailyBatchSheetResponse,
    ProdBatchSheetLineResponse,
    ReceivingLogSummary,
)
from app.dependencies.auth import get_current_active_user, require_role

router = APIRouter(prefix="/production/batches", tags=["batch-sheets"])


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
        is_used=line.is_used,
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


async def _get_or_init_sheet(batch_id: int, db: AsyncSession) -> ProdDailyBatchSheet:
    """Return existing sheet, or create one pre-populated with active 原料 items."""
    result = await db.execute(
        _base_sheet_query().where(ProdDailyBatchSheet.batch_id == batch_id)
    )
    sheet = result.scalar_one_or_none()
    if sheet:
        return sheet

    # Auto-initialize: create sheet + one line per active 原料 item
    sheet = ProdDailyBatchSheet(batch_id=batch_id)
    db.add(sheet)
    await db.flush()  # get sheet.id

    items_result = await db.execute(
        select(InvItem)
        .where(InvItem.category == "原料", InvItem.is_active == True)
        .order_by(InvItem.code)
    )
    items = items_result.scalars().all()

    for seq, item in enumerate(items):
        line = ProdBatchSheetLine(
            sheet_id=sheet.id,
            inv_item_id=item.id,
            ingredient_name=item.name,
            unit=item.base_unit,
            seq=seq,
        )
        db.add(line)

    await db.commit()

    # Reload with relationships
    result = await db.execute(
        _base_sheet_query().where(ProdDailyBatchSheet.batch_id == batch_id)
    )
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{batch_id}/batch-sheet", response_model=ProdDailyBatchSheetResponse)
async def get_batch_sheet(
    batch_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get (or auto-initialize) the daily batch sheet for a production batch."""
    await _get_batch_or_404(batch_id, db)
    sheet = await _get_or_init_sheet(batch_id, db)
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

    # Get or create the sheet header
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
        # Update operator info on first real save
        if not sheet.operator_id:
            sheet.operator_id = current_user.id
            sheet.operator_name = data.operator_name or current_user.full_name

    # Delete existing lines and replace
    existing_result = await db.execute(
        select(ProdBatchSheetLine).where(ProdBatchSheetLine.sheet_id == sheet.id)
    )
    for old_line in existing_result.scalars().all():
        await db.delete(old_line)
    await db.flush()

    for line_data in data.lines:
        line = ProdBatchSheetLine(
            sheet_id=sheet.id,
            inv_item_id=line_data.inv_item_id,
            ingredient_name=line_data.ingredient_name,
            receiving_log_id=line_data.receiving_log_id,
            is_used=line_data.is_used,
            supplier=line_data.supplier,
            supplier_batch_no=line_data.supplier_batch_no,
            qty_used=line_data.qty_used,
            unit=line_data.unit,
            seq=line_data.seq,
        )
        db.add(line)

    await db.commit()

    result = await db.execute(
        _base_sheet_query().where(ProdDailyBatchSheet.batch_id == batch_id)
    )
    sheet = result.scalar_one()
    return _sheet_to_response(sheet)


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
    sheet = result.scalar_one()
    return _sheet_to_response(sheet)
