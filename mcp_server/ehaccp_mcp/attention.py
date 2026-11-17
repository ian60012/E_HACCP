"""Classify records that still need a signature, a lock, or a corrective action.

Handwritten signatures exist on cooking, cooling, mixing, assembly, and
production batches. Receiving, sanitising, PPE, and deviation rows do not
have signature columns. PPE review is `reviewed_by`. Legacy rows may predate
mandatory signatures; this classifier only reports the missing field.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any


SIGNATURE_LOGS = {"cooking", "cooling", "mixing", "assembly", "batch"}
LOCKABLE_LOGS = {
    "cooking",
    "cooling",
    "mixing",
    "assembly",
    "receiving",
    "sanitising",
    "cleaning",
    "ppe",
    "deviation",
    "batch_sheet",
}
PPE_ITEMS = (
    "hair_net",
    "beard_net",
    "clean_uniform",
    "no_nail_polish",
    "safety_shoes",
    "single_use_mask",
    "no_jewellery",
    "hand_hygiene",
    "gloves",
)


def parse_day(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value)
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def record_day(record: dict[str, Any], preferred: str | None = None) -> date | None:
    keys = [preferred] if preferred else []
    keys.extend(["check_date", "production_date", "start_time", "created_at"])
    seen: set[str] = set()
    for key in keys:
        if not key or key in seen:
            continue
        seen.add(key)
        day = parse_day(record.get(key))
        if day is not None:
            return day
    return None


def _signed(record: dict[str, Any], stem: str) -> bool:
    flag = f"has_{stem}"
    if flag in record:
        return bool(record[flag])
    return bool(record.get(f"{stem}_data_url"))


def _text(record: dict[str, Any], key: str) -> str:
    value = record.get(key)
    return value.strip() if isinstance(value, str) else ""


def classify(log_type: str, record: dict[str, Any], *, as_of: date, overdue_days: int) -> list[str]:
    if record.get("is_voided"):
        return []
    flags: list[str] = []
    if log_type in SIGNATURE_LOGS and not _signed(record, "operator_signature"):
        flags.append("unsigned")
    if log_type == "batch" and record.get("status") in {"packed", "closed"}:
        if not _signed(record, "packing_verifier_signature"):
            flags.append("unsigned")
    if log_type == "batch_sheet":
        if not record.get("has_sheet"):
            flags.append("incomplete")
        elif not record.get("verified_by"):
            flags.append("unsigned")
    if log_type == "ppe" and not record.get("reviewed_by"):
        flags.append("unreviewed")
    if log_type in LOCKABLE_LOGS and record.get("is_locked") is False:
        if log_type != "batch_sheet" or record.get("has_sheet"):
            flags.append("unlocked")
    if log_type == "cooking" and (
        record.get("end_time") is None or record.get("core_temp") is None or record.get("ccp_status") is None
    ):
        flags.append("incomplete")
    if log_type == "cooling" and (
        record.get("end_time") is None or record.get("end_temp") is None or record.get("ccp_status") is None
    ):
        flags.append("incomplete")
    if log_type == "mixing" and record.get("end_time") is None:
        flags.append("incomplete")
    if log_type in {"cooking", "cooling", "receiving", "sanitising"} and _needs_corrective_action(log_type, record):
        flags.append("incomplete")
    if log_type == "cleaning" and _cleaning_incomplete(record):
        flags.append("incomplete")
    if log_type == "ppe" and any(record.get(item) == "Fail" for item in PPE_ITEMS):
        flags.append("incomplete")
    if log_type == "batch" and record.get("status") == "open":
        flags.append("incomplete")
    if log_type == "quality" and record.get("quality_status") in {"not_started", "draft"}:
        flags.append("incomplete")
    if log_type == "quality" and record.get("quality_status") == "rejected":
        flags.append("rejected")
    if log_type == "deviation" and not record.get("closed_at"):
        flags.append("open_capa")
    if _is_overdue(log_type, record, flags, as_of=as_of, overdue_days=overdue_days):
        flags.append("overdue")
    return _unique(flags)


def matches_kind(flags: list[str], kind: str) -> bool:
    if kind == "unsigned":
        return "unsigned" in flags or "unreviewed" in flags
    return kind in flags


def _needs_corrective_action(log_type: str, record: dict[str, Any]) -> bool:
    if log_type in {"cooking", "cooling"} and record.get("ccp_status") in {"Fail", "Deviation"}:
        return not _text(record, "corrective_action")
    if log_type == "receiving" and (
        record.get("acceptance_status") in {"Reject", "Hold"}
        or record.get("vehicle_cleanliness") == "Fail"
        or record.get("packaging_integrity") == "Fail"
    ):
        return not _text(record, "corrective_action")
    if log_type == "sanitising" and record.get("atp_status") == "Fail":
        return not _text(record, "corrective_action")
    return False


def _cleaning_incomplete(record: dict[str, Any]) -> bool:
    items = record.get("items")
    if not isinstance(items, list) or not items:
        return True
    return any(isinstance(item, dict) and not item.get("result") for item in items)


def _is_overdue(
    log_type: str,
    record: dict[str, Any],
    flags: list[str],
    *,
    as_of: date,
    overdue_days: int,
) -> bool:
    day = record_day(record)
    if day is None:
        return False
    age = (as_of - day).days
    if age < overdue_days:
        return False
    if log_type == "deviation" and "open_capa" in flags:
        return True
    return "unlocked" in flags or "unsigned" in flags or "unreviewed" in flags or "incomplete" in flags


def _unique(flags: list[str]) -> list[str]:
    ordered: list[str] = []
    for flag in flags:
        if flag not in ordered:
            ordered.append(flag)
    return ordered
