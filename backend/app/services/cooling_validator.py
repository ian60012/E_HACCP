"""
Cooling CCP validator (FSP-LOG-005) — most complex business logic.

Two-stage progressive validation:
  Stage 1: 60 deg C -> 21 deg C within 2 hours (120 min)
  Total:   60 deg C -> <5 deg C  within 6 hours (360 min)

If goes_to_freezer=True, only Stage 1 is required. Once Stage 1 passes,
the record is marked as Pass (product goes directly to freezer, no Stage 2 needed).

Called on both CREATE and UPDATE. Validates whatever data is present,
supporting progressive recording (start -> stage1 -> end).
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import CCPStatus, Severity, ImmediateAction
from app.services.deviation_service import auto_create_deviation

STAGE1_MAX_MINUTES = Decimal("120.0")   # 2 hours
STAGE1_MAX_TEMP = Decimal("21.0")       # must reach <= 21 deg C
TOTAL_MAX_MINUTES = Decimal("360.0")    # 6 hours total
END_TARGET_TEMP = Decimal("5.0")        # must reach < 5 deg C


async def validate_cooling_ccp(
    db: AsyncSession,
    cooling_log_id: int,
    start_time: datetime,
    start_temp: Decimal,
    stage1_time: Optional[datetime],
    stage1_temp: Optional[Decimal],
    end_time: Optional[datetime],
    end_temp: Optional[Decimal],
    operator_id: int,
    goes_to_freezer: bool = False,
) -> Optional[CCPStatus]:
    """
    Progressive CCP validation for cooling logs.

    Returns:
    - None:      Not enough data to determine (in progress)
    - Pass:      All stages passed
    - Deviation: Stage 1 failed but cooling still in progress
    - Fail:      Final determination — at least one stage failed

    If goes_to_freezer=True:
    - Stage 1 pass → immediate Pass (no end data needed)
    - Stage 1 fail → Deviation (same as standard flow)
    """
    # No stage1 data yet — still in progress, no determination
    if stage1_time is None or stage1_temp is None:
        return None

    # Calculate stage 1 duration in minutes
    stage1_seconds = (stage1_time - start_time).total_seconds()
    stage1_duration = Decimal(str(stage1_seconds / 60.0))

    stage1_pass = (
        stage1_duration <= STAGE1_MAX_MINUTES
        and stage1_temp <= STAGE1_MAX_TEMP
    )

    # Freezer products: Stage 1 is the final check — no end data required
    if goes_to_freezer:
        if stage1_pass:
            return CCPStatus.PASS
        # Stage 1 failed even for freezer product
        description = _build_stage1_failure_description(stage1_duration, stage1_temp)
        await auto_create_deviation(
            db=db,
            source_table="cooling_logs",
            source_record_id=cooling_log_id,
            description=description,
            severity=Severity.CRITICAL,
            immediate_action=ImmediateAction.HOLD,
            operator_id=operator_id,
            immediate_action_detail="Cooling process exceeded Stage 1 limits before freezer transfer. Consider discarding.",
        )
        return CCPStatus.FAIL

    # Non-freezer products: need end data for full determination
    if end_time is None or end_temp is None:
        if not stage1_pass:
            description = _build_stage1_failure_description(
                stage1_duration, stage1_temp
            )
            await auto_create_deviation(
                db=db,
                source_table="cooling_logs",
                source_record_id=cooling_log_id,
                description=description,
                severity=Severity.CRITICAL,
                immediate_action=ImmediateAction.HOLD,
                operator_id=operator_id,
                immediate_action_detail="Cooling process exceeded Stage 1 limits. Consider blast freezing or discarding.",
            )
            return CCPStatus.DEVIATION
        # Stage 1 passed but cooling not complete
        return None

    # End data present — final determination
    total_seconds = (end_time - start_time).total_seconds()
    total_duration = Decimal(str(total_seconds / 60.0))

    total_pass = (
        total_duration <= TOTAL_MAX_MINUTES
        and end_temp < END_TARGET_TEMP
    )

    if stage1_pass and total_pass:
        return CCPStatus.PASS

    # At least one stage failed
    description = _build_failure_description(
        stage1_pass, stage1_duration, stage1_temp,
        total_pass, total_duration, end_temp,
    )
    await auto_create_deviation(
        db=db,
        source_table="cooling_logs",
        source_record_id=cooling_log_id,
        description=description,
        severity=Severity.CRITICAL,
        immediate_action=ImmediateAction.HOLD,
        operator_id=operator_id,
        immediate_action_detail="Cooling CCP failure. Product must be held for QA review.",
    )
    return CCPStatus.FAIL


def _build_stage1_failure_description(
    duration: Decimal, temp: Decimal
) -> str:
    """Build description for Stage 1 failure."""
    parts = ["Cooling CCP Stage 1 failure:"]
    if duration > STAGE1_MAX_MINUTES:
        parts.append(f"duration {duration:.1f}min exceeds 120min limit.")
    if temp > STAGE1_MAX_TEMP:
        parts.append(f"temperature {temp}C exceeds 21C target.")
    return " ".join(parts)


def _build_failure_description(
    s1_pass: bool, s1_dur: Decimal, s1_temp: Decimal,
    total_pass: bool, total_dur: Decimal, end_temp: Decimal,
) -> str:
    """Build description for overall cooling failure."""
    parts = ["Cooling CCP failure:"]
    if not s1_pass:
        if s1_dur > STAGE1_MAX_MINUTES:
            parts.append(f"Stage1 duration {s1_dur:.1f}min > 120min.")
        if s1_temp > STAGE1_MAX_TEMP:
            parts.append(f"Stage1 temp {s1_temp}C > 21C.")
    if not total_pass:
        if total_dur > TOTAL_MAX_MINUTES:
            parts.append(f"Total duration {total_dur:.1f}min > 360min.")
        if end_temp >= END_TARGET_TEMP:
            parts.append(f"End temp {end_temp}C >= 5C target.")
    return " ".join(parts)
