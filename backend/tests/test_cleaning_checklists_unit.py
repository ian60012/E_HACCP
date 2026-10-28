from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.cleaning_checklist import CleaningChecklistCreate
from app.services.cleaning_checklist_template import get_cleaning_checklist_template


def completed_items():
    items = get_cleaning_checklist_template()
    for item in items:
        item["result"] = "clean"
    return items


def test_template_matches_source_checklists():
    items = get_cleaning_checklist_template()

    assert len(items) == 22
    assert [item["section_code"] for item in items[:7]] == ["1.0"] * 7
    assert items[0]["item_name_en"] == "Walls"
    assert items[10]["item_name_en"] == "Dumpling Machine"
    assert items[-1]["item_name_zh"] == "其他儲存區域"


def test_completed_checklist_is_valid():
    checklist = CleaningChecklistCreate(
        check_date=date(2026, 10, 28),
        line_type="dumpling",
        items=completed_items(),
    )

    assert checklist.line_type.value == "dumpling"
    assert len(checklist.items) == 22


def test_incomplete_or_duplicate_items_are_rejected():
    incomplete = get_cleaning_checklist_template()
    with pytest.raises(ValidationError, match="all checklist items"):
        CleaningChecklistCreate(
            check_date=date(2026, 10, 28),
            line_type="cooking",
            items=incomplete,
        )

    duplicate = completed_items()
    duplicate[1]["code"] = duplicate[0]["code"]
    with pytest.raises(ValidationError, match="codes must be unique"):
        CleaningChecklistCreate(
            check_date=date(2026, 10, 28),
            line_type="cooking",
            items=duplicate,
        )
