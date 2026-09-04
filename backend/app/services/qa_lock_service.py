"""QA lock service — lock records after QA verification."""

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.services.audit_service import create_audit_entry


async def lock_record(
    db: AsyncSession,
    model_class: type,
    record_id: int,
    current_user: User,
    verifier_signature_data_url: Optional[str] = None,
) -> object:
    """
    QA-lock a record: set is_locked=True, verified_by=current_user.

    Preconditions:
    - Record exists and is not voided
    - Record is not already locked
    - User has QA or Manager role (checked by router dependency)

    Also enforced by DB trigger prevent_locked_modification().
    """
    result = await db.execute(
        select(model_class).where(model_class.id == record_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.is_voided:
        raise HTTPException(status_code=400, detail="Cannot lock a voided record")
    if record.is_locked:
        raise HTTPException(status_code=400, detail="Record is already locked")

    record.is_locked = True
    record.verified_by = current_user.id

    changed_fields = ["is_locked", "verified_by"]
    old_values = {"is_locked": False, "verified_by": None}
    new_values = {"is_locked": True, "verified_by": current_user.id}
    if verifier_signature_data_url is not None:
        if not hasattr(record, "verifier_signature_data_url"):
            raise HTTPException(status_code=500, detail="This record type does not support verifier signatures")
        record.verifier_signature_data_url = verifier_signature_data_url
        changed_fields.append("verifier_signature_data_url")
        old_values["verifier_signature_data_url"] = None
        new_values["verifier_signature_data_url"] = "[signature captured]"

    await create_audit_entry(
        db=db,
        table_name=model_class.__tablename__,
        record_id=record_id,
        action="LOCK",
        changed_by=current_user.id,
        changed_fields=changed_fields,
        old_values=old_values,
        new_values=new_values,
    )

    await db.commit()
    await db.refresh(record)
    return record
