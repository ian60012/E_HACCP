"""Assembly & packing validator (FSP-LOG-ASM-001)."""

from decimal import Decimal
from typing import Optional, List

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Severity, ImmediateAction
from app.services.deviation_service import auto_create_deviation


async def validate_assembly(
    db: AsyncSession,
    assembly_log_id: int,
    is_allergen_declared: bool,
    average_weight_g: Optional[Decimal],
    target_weight_g: Optional[Decimal],
    operator_id: int,
) -> List[str]:
    """
    Validate assembly & packing checks. Returns list of warning messages.

    Rules:
    - is_allergen_declared = False -> CRITICAL deviation, quarantine
    - average_weight_g < target_weight_g -> MAJOR deviation, hold

    Note: average_weight_g is a generated column. Must db.refresh() after
    insert to get the computed value before calling this function.
    """
    warnings: List[str] = []

    if not is_allergen_declared:
        await auto_create_deviation(
            db=db,
            source_table="assembly_packing_logs",
            source_record_id=assembly_log_id,
            description=(
                "Allergen not declared on label. "
                "Potential recall risk. Batch must be isolated immediately."
            ),
            severity=Severity.CRITICAL,
            immediate_action=ImmediateAction.QUARANTINE,
            operator_id=operator_id,
        )
        warnings.append("CRITICAL: Allergen not declared - batch quarantined")

    if (
        average_weight_g is not None
        and target_weight_g is not None
        and average_weight_g < target_weight_g
    ):
        await auto_create_deviation(
            db=db,
            source_table="assembly_packing_logs",
            source_record_id=assembly_log_id,
            description=(
                f"Average weight {average_weight_g}g below target {target_weight_g}g. "
                f"Batch requires isolation and reweighing."
            ),
            severity=Severity.MAJOR,
            immediate_action=ImmediateAction.HOLD,
            operator_id=operator_id,
        )
        warnings.append(
            f"Underweight: avg {average_weight_g}g < target {target_weight_g}g"
        )

    return warnings
