"""
Cooking CCP validator (FSP-LOG-004).

Validates core temperature against product-specific CCP limit.
Auto-creates deviation when temperature is below the limit.
"""

from decimal import Decimal
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import CCPStatus, Severity, ImmediateAction
from app.services.deviation_service import auto_create_deviation

CCP_DEFAULT_TEMP = Decimal("75.00")


async def validate_cooking_ccp(
    db: AsyncSession,
    cooking_log_id: int,
    core_temp: Optional[Decimal],
    ccp_limit: Decimal,
    operator_id: int,
) -> Optional[CCPStatus]:
    """
    Validate cooking CCP and auto-create deviation if failed.

    Rules:
    - core_temp is None -> None (not yet recorded)
    - core_temp >= ccp_limit -> Pass
    - core_temp < ccp_limit -> Fail, auto-create deviation

    Returns the CCPStatus enum value to store on the cooking_log.
    """
    if core_temp is None:
        return None

    if core_temp >= ccp_limit:
        return CCPStatus.PASS

    # CCP FAILURE — auto-create deviation
    description = (
        f"Cooking CCP failure: core temperature {core_temp}C "
        f"is below the CCP limit of {ccp_limit}C. "
        f"Corrective action required."
    )
    await auto_create_deviation(
        db=db,
        source_table="cooking_logs",
        source_record_id=cooking_log_id,
        description=description,
        severity=Severity.CRITICAL,
        immediate_action=ImmediateAction.HOLD,
        operator_id=operator_id,
    )
    return CCPStatus.FAIL
