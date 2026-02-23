"""Receiving inspection validator (FSP-LOG-001)."""

from decimal import Decimal
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import PassFail, Acceptance, Severity, ImmediateAction
from app.services.deviation_service import auto_create_deviation

CHILLED_MAX_TEMP = Decimal("5.0")
FROZEN_MAX_TEMP = Decimal("-18.0")


async def validate_receiving(
    db: AsyncSession,
    receiving_log_id: int,
    temp_chilled: Optional[Decimal],
    temp_frozen: Optional[Decimal],
    vehicle_cleanliness: PassFail,
    packaging_integrity: PassFail,
    operator_id: int,
) -> bool:
    """
    Validate receiving inspection and auto-create deviation if needed.

    Returns True if any failures were detected (deviation created).
    """
    failures = []

    if temp_chilled is not None and temp_chilled > CHILLED_MAX_TEMP:
        failures.append(f"Chilled temp {temp_chilled}C exceeds 5.0C limit")
    if temp_frozen is not None and temp_frozen > FROZEN_MAX_TEMP:
        failures.append(f"Frozen temp {temp_frozen}C exceeds -18.0C limit")
    if vehicle_cleanliness == PassFail.FAIL:
        failures.append("Vehicle cleanliness failed")
    if packaging_integrity == PassFail.FAIL:
        failures.append("Packaging integrity failed")

    if not failures:
        return False

    description = "Receiving inspection failure: " + "; ".join(failures)
    await auto_create_deviation(
        db=db,
        source_table="receiving_logs",
        source_record_id=receiving_log_id,
        description=description,
        severity=Severity.MAJOR,
        immediate_action=ImmediateAction.HOLD,
        operator_id=operator_id,
    )
    return True
