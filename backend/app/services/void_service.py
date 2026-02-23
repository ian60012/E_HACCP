"""Void service — soft-delete records with audit trail."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.services.audit_service import create_audit_entry


async def void_record(
    db: AsyncSession,
    model_class: type,
    record_id: int,
    void_reason: str,
    current_user: User,
) -> object:
    """
    Void a record: set is_voided=True with reason, timestamp, and attribution.

    Works even on locked records (DB trigger allows voiding locked records).

    Preconditions:
    - Record exists
    - Record is not already voided
    - User has Manager role (checked by router dependency)
    """
    result = await db.execute(
        select(model_class).where(model_class.id == record_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.is_voided:
        raise HTTPException(status_code=400, detail="Record is already voided")

    now = datetime.now(timezone.utc)
    record.is_voided = True
    record.void_reason = void_reason
    record.voided_at = now
    record.voided_by = current_user.id

    await create_audit_entry(
        db=db,
        table_name=model_class.__tablename__,
        record_id=record_id,
        action="VOID",
        changed_by=current_user.id,
        changed_fields=["is_voided", "void_reason", "voided_at", "voided_by"],
        old_values={"is_voided": False},
        new_values={"is_voided": True, "void_reason": void_reason},
        reason=void_reason,
    )

    await db.commit()
    await db.refresh(record)
    return record
