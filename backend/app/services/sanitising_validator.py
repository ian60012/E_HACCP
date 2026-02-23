"""Sanitising ATP validator (FSP-LOG-CLN-001)."""

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import PassFail, Severity, ImmediateAction
from app.services.deviation_service import auto_create_deviation

ATP_RTE_THRESHOLD = 100  # RLU


async def validate_sanitising_atp(
    db: AsyncSession,
    sanitising_log_id: int,
    atp_result_rlu: Optional[int],
    operator_id: int,
) -> Optional[PassFail]:
    """
    Validate ATP swab result for sanitising.

    Rules:
    - atp_result_rlu is None -> None (no test performed)
    - atp_result_rlu <= 100 RLU -> Pass
    - atp_result_rlu > 100 RLU -> Fail, auto-create deviation

    Returns PassFail enum or None.
    """
    if atp_result_rlu is None:
        return None

    if atp_result_rlu <= ATP_RTE_THRESHOLD:
        return PassFail.PASS

    description = (
        f"ATP sanitation failure: {atp_result_rlu} RLU exceeds "
        f"{ATP_RTE_THRESHOLD} RLU threshold for RTE contact surfaces. "
        f"Re-clean and re-swab required."
    )
    await auto_create_deviation(
        db=db,
        source_table="sanitising_logs",
        source_record_id=sanitising_log_id,
        description=description,
        severity=Severity.MAJOR,
        immediate_action=ImmediateAction.REWORK,
        operator_id=operator_id,
        immediate_action_detail="Re-clean surface and perform ATP re-test",
    )
    return PassFail.FAIL
