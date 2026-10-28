"""Schemas for FSP-LOG-CLN-003/005 daily cleaning checklists."""

from datetime import date
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import ALCOAResponseMixin


class CleaningLineType(str, Enum):
    DUMPLING = "dumpling"
    COOKING = "cooking"


class CleaningCheckResult(str, Enum):
    CLEAN = "clean"
    NEEDS_CLEANING = "needs_cleaning"
    DAMAGED_FAULTY = "damaged_faulty"


class CleaningChecklistItem(BaseModel):
    code: str = Field(min_length=1, max_length=10)
    section_code: str = Field(min_length=1, max_length=10)
    section_name_en: str = Field(min_length=1, max_length=100)
    section_name_zh: str = Field(min_length=1, max_length=100)
    item_name_en: str = Field(min_length=1, max_length=150)
    item_name_zh: str = Field(min_length=1, max_length=150)
    result: Optional[CleaningCheckResult] = None
    comments: Optional[str] = Field(None, max_length=1000)

    @field_validator(
        "code", "section_code", "section_name_en", "section_name_zh", "item_name_en", "item_name_zh"
    )
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("value cannot be blank")
        return value

    @field_validator("comments")
    @classmethod
    def strip_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None


def _validate_items(items: Optional[list[CleaningChecklistItem]]) -> Optional[list[CleaningChecklistItem]]:
    if items is None:
        return None
    codes = [item.code for item in items]
    if len(codes) != len(set(codes)):
        raise ValueError("checklist item codes must be unique")
    return items


class CleaningChecklistCreate(BaseModel):
    check_date: date
    line_type: CleaningLineType
    items: list[CleaningChecklistItem] = Field(min_length=1, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)

    _unique_items = field_validator("items")(_validate_items)

    @model_validator(mode="after")
    def require_completed_items(self):
        if any(item.result is None for item in self.items):
            raise ValueError("all checklist items must have a result")
        return self


class CleaningChecklistUpdate(BaseModel):
    check_date: Optional[date] = None
    line_type: Optional[CleaningLineType] = None
    items: Optional[list[CleaningChecklistItem]] = Field(None, min_length=1, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)

    _unique_items = field_validator("items")(_validate_items)

    @model_validator(mode="after")
    def require_completed_items(self):
        if self.items is not None and any(item.result is None for item in self.items):
            raise ValueError("all checklist items must have a result")
        return self


class CleaningChecklistResponse(ALCOAResponseMixin):
    model_config = ConfigDict(from_attributes=True)

    id: int
    check_date: date
    line_type: CleaningLineType
    items: list[CleaningChecklistItem]
    notes: Optional[str] = None


class CleaningChecklistTemplateResponse(BaseModel):
    line_type: CleaningLineType
    form_code: str
    title_en: str
    title_zh: str
    items: list[CleaningChecklistItem]
