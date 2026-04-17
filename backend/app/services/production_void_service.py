"""Void a production batch and cascade-void its downstream HACCP logs + stock doc."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assembly_packing_log import AssemblyPackingLog
from app.models.cooking_log import CookingLog
from app.models.cooling_log import CoolingLog
from app.models.enums import InvDocStatus
from app.models.inventory import InvStockDoc
from app.models.mixing_log import MixingLog
from app.models.production import ProdBatch
from app.models.user import User
from app.services.audit_service import create_audit_entry
from app.services.inventory_service import void_document as void_stock_doc


async def void_batch(
    db: AsyncSession,
    batch_id: int,
    void_reason: str,
    current_user: User,
) -> ProdBatch:
    """
    Soft-delete a ProdBatch and cascade void to:
      - CookingLog / CoolingLog / MixingLog / AssemblyPackingLog rows linked via prod_batch_id
      - InvStockDoc referenced by batch.inv_stock_doc_id (status -> Voided)

    Writes one audit_log entry per voided record, all in a single transaction.
    Caller must have Admin role (enforced by router dependency).
    """
    batch = await db.get(ProdBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if batch.is_voided:
        raise HTTPException(status_code=400, detail="Batch is already voided")

    now = datetime.now(timezone.utc)
    cascade_reason = f"由批次 {batch.batch_code} 廢棄連帶作廢：{void_reason}"

    batch.is_voided = True
    batch.void_reason = void_reason
    batch.voided_at = now
    batch.voided_by = current_user.id

    await create_audit_entry(
        db=db,
        table_name="prod_batches",
        record_id=batch.id,
        action="VOID",
        changed_by=current_user.id,
        changed_fields=["is_voided", "void_reason", "voided_at", "voided_by"],
        old_values={"is_voided": False},
        new_values={"is_voided": True, "void_reason": void_reason},
        reason=void_reason,
    )

    for model_class in (CookingLog, CoolingLog, MixingLog, AssemblyPackingLog):
        result = await db.execute(
            select(model_class).where(
                model_class.prod_batch_id == batch.id,
                model_class.is_voided.is_(False),
            )
        )
        for log in result.scalars().all():
            log.is_voided = True
            log.void_reason = cascade_reason
            log.voided_at = now
            log.voided_by = current_user.id
            await create_audit_entry(
                db=db,
                table_name=model_class.__tablename__,
                record_id=log.id,
                action="VOID",
                changed_by=current_user.id,
                changed_fields=["is_voided", "void_reason", "voided_at", "voided_by"],
                old_values={"is_voided": False},
                new_values={"is_voided": True, "void_reason": cascade_reason},
                reason=cascade_reason,
            )

    if batch.inv_stock_doc_id:
        stock_doc = await db.get(InvStockDoc, batch.inv_stock_doc_id)
        if stock_doc and stock_doc.status == InvDocStatus.POSTED:
            # Reverse stock balances + movements via existing inventory service
            await void_stock_doc(db, stock_doc.id, cascade_reason)
            await create_audit_entry(
                db=db,
                table_name="inv_stock_docs",
                record_id=stock_doc.id,
                action="VOID",
                changed_by=current_user.id,
                changed_fields=["status", "void_reason", "voided_at"],
                old_values={"status": "Posted"},
                new_values={"status": "Voided", "void_reason": cascade_reason},
                reason=cascade_reason,
            )

    await db.commit()
    await db.refresh(batch)
    return batch
