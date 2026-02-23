"""
Deviation service — auto-create deviations when CCP checks fail.

Uses polymorphic reference pattern (source_log_type + source_log_id)
to link deviation records back to any log table.
"""

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.deviation_log import DeviationLog
from app.models.enums import LogType, Severity, ImmediateAction


# Mapping from table name to LogType enum value
TABLE_TO_LOG_TYPE = {
    "receiving_logs": LogType.RECEIVING,
    "cooking_logs": LogType.COOKING,
    "cooling_logs": LogType.COOLING,
    "sanitising_logs": LogType.SANITISING,
    "assembly_packing_logs": LogType.ASSEMBLY,
}


async def auto_create_deviation(
    db: AsyncSession,
    source_table: str,
    source_record_id: int,
    description: str,
    severity: Severity,
    immediate_action: ImmediateAction,
    operator_id: int,
    immediate_action_detail: Optional[str] = None,
) -> DeviationLog:
    """
    Auto-create a deviation_log entry when a CCP check fails.

    Called within the same transaction as the log insert/update.
    The caller is responsible for db.commit().
    """
    log_type = TABLE_TO_LOG_TYPE.get(source_table)
    if not log_type:
        raise ValueError(f"Unknown source table: {source_table}")

    deviation = DeviationLog(
        source_log_type=log_type,
        source_log_id=source_record_id,
        description=description,
        severity=severity,
        immediate_action=immediate_action,
        immediate_action_detail=immediate_action_detail,
        operator_id=operator_id,
    )
    db.add(deviation)
    return deviation


async def get_deviations_for_record(
    db: AsyncSession,
    source_table: str,
    source_record_id: int,
) -> list[DeviationLog]:
    """Fetch all non-voided deviations linked to a specific log entry."""
    log_type = TABLE_TO_LOG_TYPE.get(source_table)
    if not log_type:
        return []

    result = await db.execute(
        select(DeviationLog)
        .where(DeviationLog.source_log_type == log_type)
        .where(DeviationLog.source_log_id == source_record_id)
        .where(DeviationLog.is_voided == False)
        .order_by(DeviationLog.created_at.desc())
    )
    return list(result.scalars().all())
