"""Audit log service — ALCOA+ change tracking."""

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def create_audit_entry(
    db: AsyncSession,
    table_name: str,
    record_id: int,
    action: str,
    changed_by: int,
    changed_fields: Optional[list] = None,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    reason: Optional[str] = None,
) -> AuditLog:
    """
    Insert an audit_log entry tracking a change to a record.

    Called by qa_lock, void, and update services.
    The caller is responsible for db.commit().
    """
    entry = AuditLog(
        table_name=table_name,
        record_id=record_id,
        action=action,
        changed_fields=changed_fields,
        old_values=old_values,
        new_values=new_values,
        changed_by=changed_by,
        reason=reason,
    )
    db.add(entry)
    return entry
