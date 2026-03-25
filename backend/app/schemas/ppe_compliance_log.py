"""PPE Compliance Log schemas (FSP-LOG-PPE-001)."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ALCOAResponseMixin


class PPEComplianceLogCreate(BaseModel):
    """Create a PPE compliance log. operator_id comes from JWT."""
    check_date: date
    area_id: int
    staff_count: int = Field(..., gt=0)

    hair_net: str = Field(..., description="Pass or Fail")
    beard_net: str = Field(..., description="Pass or Fail")
    clean_uniform: str = Field(..., description="Pass or Fail")
    no_nail_polish: str = Field(..., description="Pass or Fail")
    safety_shoes: str = Field(..., description="Pass or Fail")
    single_use_mask: str = Field(..., description="Pass or Fail")
    no_jewellery: str = Field(..., description="Pass or Fail")
    hand_hygiene: str = Field(..., description="Pass or Fail")
    gloves: str = Field(..., description="Pass or Fail")

    details_actions: Optional[str] = None
    capa_no: Optional[str] = Field(None, max_length=50)


class PPEComplianceLogUpdate(BaseModel):
    """Update a PPE compliance log."""
    hair_net: Optional[str] = None
    beard_net: Optional[str] = None
    clean_uniform: Optional[str] = None
    no_nail_polish: Optional[str] = None
    safety_shoes: Optional[str] = None
    single_use_mask: Optional[str] = None
    no_jewellery: Optional[str] = None
    hand_hygiene: Optional[str] = None
    gloves: Optional[str] = None

    details_actions: Optional[str] = None
    capa_no: Optional[str] = Field(None, max_length=50)
    reviewed_by: Optional[int] = None
    reviewed_at: Optional[date] = None


class PPEComplianceLogResponse(ALCOAResponseMixin):
    """PPE compliance log response with ALCOA+ audit fields."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    check_date: date
    area_id: int
    area_name: Optional[str] = None
    staff_count: int

    hair_net: str
    beard_net: str
    clean_uniform: str
    no_nail_polish: str
    safety_shoes: str
    single_use_mask: str
    no_jewellery: str
    hand_hygiene: str
    gloves: str

    details_actions: Optional[str] = None
    capa_no: Optional[str] = None

    reviewed_by: Optional[int] = None
    reviewer_name: Optional[str] = None
    reviewed_at: Optional[date] = None
