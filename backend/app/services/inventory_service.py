"""
Inventory module business logic service.

Handles document posting (balance update + movement ledger),
document voiding (reversal), document number generation,
and conversion of receiving logs to stock-IN documents.
"""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.inventory import (
    InvStockDoc, InvStockLine, InvStockBalance, InvStockMovement, InvItem,
    InvStocktake, InvStocktakeLine,
)
from app.models.receiving_log import ReceivingLog
from app.models.enums import InvDocType, InvDocStatus, InvStocktakeStatus


async def generate_doc_number(session: AsyncSession, doc_type: str) -> str:
    """
    Generate a unique sequential document number.
    Format: IN-YYYYMMDD-NNNN  or  OUT-YYYYMMDD-NNNN
    """
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"{doc_type}-{today}-"

    from sqlalchemy import func
    from app.models.inventory import InvStockDoc as Doc
    result = await session.execute(
        select(func.count()).where(Doc.doc_number.like(f"{prefix}%"))
    )
    count = result.scalar() or 0
    return f"{prefix}{count + 1:04d}"


async def post_document(session: AsyncSession, doc_id: int, operator_id: int) -> InvStockDoc:
    """
    Post a Draft stock document:
    1. Validate status is Draft and lines exist
    2. For each line, validate location whitelist
    3. Upsert inv_stock_balance using line.location_id
    4. Insert inv_stock_movements rows
    5. Update document status to Posted
    """
    # Load document with lines + items + allowed_locations
    result = await session.execute(
        select(InvStockDoc)
        .options(
            selectinload(InvStockDoc.lines)
            .selectinload(InvStockLine.item)
            .selectinload(InvItem.allowed_locations)
        )
        .where(InvStockDoc.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if doc.status != InvDocStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot post document with status '{doc.status.value}'"
        )
    if not doc.lines:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot post a document with no lines"
        )

    is_out = doc.doc_type == InvDocType.OUT
    delta_sign = Decimal("-1") if is_out else Decimal("1")

    for line in doc.lines:
        location_id = line.location_id

        # Whitelist validation
        allowed_ids = {loc.id for loc in line.item.allowed_locations}
        if not allowed_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"品項 '{line.item.code}' 未設定允許儲位，無法入/出庫"
            )
        if location_id not in allowed_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"品項 '{line.item.code}' 不允許存放於此儲位"
            )

        delta = delta_sign * line.quantity

        # Load or create balance row
        bal_result = await session.execute(
            select(InvStockBalance).where(
                InvStockBalance.item_id == line.item_id,
                InvStockBalance.location_id == location_id,
            )
        )
        bal = bal_result.scalar_one_or_none()

        if bal is None:
            if is_out:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"No stock for item '{line.item.name}' at this location"
                )
            bal = InvStockBalance(
                item_id=line.item_id,
                location_id=location_id,
                quantity=Decimal("0"),
            )
            session.add(bal)

        new_qty = bal.quantity + delta
        if new_qty < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient stock for item '{line.item.name}': "
                       f"available={bal.quantity}, requested={line.quantity}"
            )

        bal.quantity = new_qty

        # Record movement
        movement = InvStockMovement(
            doc_id=doc.id,
            item_id=line.item_id,
            location_id=location_id,
            delta=delta,
            balance_after=new_qty,
        )
        session.add(movement)

    # Update document status
    doc.status = InvDocStatus.POSTED
    doc.posted_at = datetime.now(timezone.utc)

    await session.flush()
    return doc


async def void_document(
    session: AsyncSession, doc_id: int, reason: str
) -> InvStockDoc:
    """
    Void a Posted stock document (reversal).
    """
    result = await session.execute(
        select(InvStockDoc)
        .options(selectinload(InvStockDoc.lines))
        .where(InvStockDoc.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if doc.status != InvDocStatus.POSTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only Posted documents can be voided (current status: '{doc.status.value}')"
        )

    is_out = doc.doc_type == InvDocType.OUT
    delta_sign = Decimal("-1") if is_out else Decimal("1")
    reverse_sign = delta_sign * Decimal("-1")

    for line in doc.lines:
        location_id = line.location_id
        reverse_delta = reverse_sign * line.quantity

        bal_result = await session.execute(
            select(InvStockBalance).where(
                InvStockBalance.item_id == line.item_id,
                InvStockBalance.location_id == location_id,
            )
        )
        bal = bal_result.scalar_one_or_none()
        if bal is None:
            bal = InvStockBalance(
                item_id=line.item_id,
                location_id=location_id,
                quantity=Decimal("0"),
            )
            session.add(bal)

        new_qty = bal.quantity + reverse_delta
        bal.quantity = new_qty

        movement = InvStockMovement(
            doc_id=doc.id,
            item_id=line.item_id,
            location_id=location_id,
            delta=reverse_delta,
            balance_after=new_qty,
        )
        session.add(movement)

    doc.status = InvDocStatus.VOIDED
    doc.voided_at = datetime.now(timezone.utc)
    doc.void_reason = reason

    await session.flush()
    return doc


async def create_stocktake(
    session: AsyncSession,
    location_id: int,
    count_date,
    notes: str | None,
    operator_id: int,
) -> InvStocktake:
    """
    Create a draft stocktake session for a location.
    Snapshots current InvStockBalance rows at that location as lines.
    """
    # Generate doc_number: ST-YYYYMMDD-NNN
    from sqlalchemy import func as sa_func
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"ST-{today}-"
    count_result = await session.execute(
        select(sa_func.count()).where(InvStocktake.doc_number.like(f"{prefix}%"))
    )
    count = count_result.scalar() or 0
    doc_number = f"{prefix}{count + 1:03d}"

    stocktake = InvStocktake(
        doc_number=doc_number,
        status=InvStocktakeStatus.DRAFT,
        location_id=location_id,
        count_date=count_date,
        notes=notes,
        operator_id=operator_id,
    )
    session.add(stocktake)
    await session.flush()

    # Snapshot all balance rows for this location
    bal_result = await session.execute(
        select(InvStockBalance).where(InvStockBalance.location_id == location_id)
    )
    balances = bal_result.scalars().all()

    for bal in balances:
        line = InvStocktakeLine(
            stocktake_id=stocktake.id,
            item_id=bal.item_id,
            location_id=location_id,
            system_qty=bal.quantity,
        )
        session.add(line)

    await session.flush()
    return stocktake


async def confirm_stocktake(
    session: AsyncSession,
    stocktake_id: int,
    operator_id: int,
) -> InvStocktake:
    """
    Confirm a draft stocktake:
    - Lines with physical_qty > system_qty → IN adjustment
    - Lines with physical_qty < system_qty → OUT adjustment
    - Lines with physical_qty is None → skipped (未盤)
    Directly updates balances and creates movement records (bypasses whitelist).
    """
    result = await session.execute(
        select(InvStocktake)
        .options(
            selectinload(InvStocktake.lines).selectinload(InvStocktakeLine.item),
        )
        .where(InvStocktake.id == stocktake_id)
    )
    stocktake = result.scalar_one_or_none()
    if not stocktake:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stocktake not found")

    st_status = stocktake.status.value if hasattr(stocktake.status, "value") else stocktake.status
    if st_status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stocktake already confirmed"
        )

    gains = [l for l in stocktake.lines if l.physical_qty is not None and l.physical_qty > l.system_qty]
    losses = [l for l in stocktake.lines if l.physical_qty is not None and l.physical_qty < l.system_qty]

    adj_in_doc_id = None
    adj_out_doc_id = None

    async def _make_adj_doc(doc_type_str: str) -> InvStockDoc:
        prefix = f"{doc_type_str}-{datetime.now(timezone.utc).strftime('%Y%m%d')}-"
        from sqlalchemy import func as sa_func
        cnt_res = await session.execute(
            select(sa_func.count()).where(InvStockDoc.doc_number.like(f"{prefix}%"))
        )
        cnt = cnt_res.scalar() or 0
        doc = InvStockDoc(
            doc_number=f"{prefix}{cnt + 1:04d}",
            doc_type=InvDocType.IN if doc_type_str == "IN" else InvDocType.OUT,
            status=InvDocStatus.POSTED,
            location_id=stocktake.location_id,
            ref_number=stocktake.doc_number,
            notes=f"盤點調整 {stocktake.doc_number}",
            operator_id=operator_id,
            posted_at=datetime.now(timezone.utc),
        )
        session.add(doc)
        await session.flush()
        return doc

    if gains:
        in_doc = await _make_adj_doc("IN")
        adj_in_doc_id = in_doc.id
        for ln in gains:
            variance = ln.physical_qty - ln.system_qty
            unit = ln.item.base_unit if ln.item else "包"
            ln_obj = InvStockLine(
                doc_id=in_doc.id,
                item_id=ln.item_id,
                location_id=ln.location_id,
                quantity=variance,
                unit=unit,
            )
            session.add(ln_obj)
            # Update balance
            bal_res = await session.execute(
                select(InvStockBalance).where(
                    InvStockBalance.item_id == ln.item_id,
                    InvStockBalance.location_id == ln.location_id,
                )
            )
            bal = bal_res.scalar_one_or_none()
            if bal is None:
                bal = InvStockBalance(item_id=ln.item_id, location_id=ln.location_id, quantity=Decimal("0"))
                session.add(bal)
            bal.quantity = bal.quantity + variance
            session.add(InvStockMovement(
                doc_id=in_doc.id, item_id=ln.item_id, location_id=ln.location_id,
                delta=variance, balance_after=bal.quantity,
            ))

    if losses:
        out_doc = await _make_adj_doc("OUT")
        adj_out_doc_id = out_doc.id
        for ln in losses:
            variance = ln.system_qty - ln.physical_qty  # positive
            unit = ln.item.base_unit if ln.item else "包"
            ln_obj = InvStockLine(
                doc_id=out_doc.id,
                item_id=ln.item_id,
                location_id=ln.location_id,
                quantity=variance,
                unit=unit,
            )
            session.add(ln_obj)
            bal_res = await session.execute(
                select(InvStockBalance).where(
                    InvStockBalance.item_id == ln.item_id,
                    InvStockBalance.location_id == ln.location_id,
                )
            )
            bal = bal_res.scalar_one_or_none()
            if bal is None:
                bal = InvStockBalance(item_id=ln.item_id, location_id=ln.location_id, quantity=Decimal("0"))
                session.add(bal)
            bal.quantity = bal.quantity - variance
            session.add(InvStockMovement(
                doc_id=out_doc.id, item_id=ln.item_id, location_id=ln.location_id,
                delta=-variance, balance_after=bal.quantity,
            ))

    stocktake.status = InvStocktakeStatus.CONFIRMED
    stocktake.confirmed_at = datetime.now(timezone.utc)
    stocktake.adj_in_doc_id = adj_in_doc_id
    stocktake.adj_out_doc_id = adj_out_doc_id
    await session.flush()
    return stocktake


async def create_from_receiving_log(
    session: AsyncSession,
    log: ReceivingLog,
    location_id: int,
    operator_id: int,
    operator_name: str,
) -> InvStockDoc:
    """
    Create a Draft stock-IN document from a locked + accepted receiving log.
    """
    if not log.is_locked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Receiving log must be locked before converting to stock-IN"
        )
    if log.acceptance_status.value != "Accept":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only accepted receiving logs can be converted to stock-IN"
        )
    if log.inv_stock_doc_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A stock-IN document has already been created for this receiving log"
        )
    if not log.inv_item_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Receiving log must have an inventory item linked before converting"
        )

    doc_number = await generate_doc_number(session, "IN")

    doc = InvStockDoc(
        doc_number=doc_number,
        doc_type=InvDocType.IN,
        status=InvDocStatus.DRAFT,
        location_id=location_id,
        receiving_log_id=log.id,
        ref_number=log.po_number,
        operator_id=operator_id,
        operator_name=operator_name,
    )
    session.add(doc)
    await session.flush()

    qty = log.quantity or Decimal("1")
    unit = log.quantity_unit or "PCS"
    line = InvStockLine(
        doc_id=doc.id,
        item_id=log.inv_item_id,
        location_id=location_id,
        quantity=qty,
        unit=unit,
    )
    session.add(line)

    log.inv_stock_doc_id = doc.id

    await session.flush()
    return doc
