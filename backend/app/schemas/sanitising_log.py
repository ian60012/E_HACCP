"""Sanitising & Cleaning Log schemas (FSP-LOG-CLN-001)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import ALCOAResponseMixin


class SanitisingLogCreate(BaseModel):
    """Create a sanitising log. operator_id comes from JWT."""
    area_id: int
    target_description: str = Field(..., min_length=1)
    chemical: str = Field(..., description="Buff, Hybrid, Command, Keyts, or Chlorine")
    dilution_ratio: Optional[str] = Field(None, max_length=20)
    atp_result_rlu: Optional[int] = Field(None, ge=0)
    atp_status: Optional[str] = Field(None, description="Pass or Fail")
    corrective_action: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def validate_atp_consistency(self):
        """ATP result and status must both be present or both absent."""
        has_rlu = self.atp_result_rlu is not None
        has_status = self.atp_status is not None
        if has_rlu != has_status:
            raise ValueError("atp_result_rlu and atp_status must both be provided or both omitted")
        return self

    @model_validator(mode="after")
    def validate_corrective_action(self):
        """Corrective action required when ATP fails."""
        if self.atp_status == "Fail" and not self.corrective_action:
            raise ValueError("corrective_action is required when atp_status is Fail")
        return self


class SanitisingLogUpdate(BaseModel):
    """Update a sanitising log."""
    atp_result_rlu: Optional[int] = Field(None, ge=0)
    atp_status: Optional[str] = None
    corrective_action: Optional[str] = None
    notes: Optional[str] = None


class SanitisingLogResponse(ALCOAResponseMixin):
    """Sanitising log response with ALCOA+ audit fields."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    area_id: int
    area_name: Optional[str] = None
    target_description: str
    chemical: str
    dilution_ratio: Optional[str] = None
    atp_result_rlu: Optional[int] = None
    atp_status: Optional[str] = None
    corrective_action: Optional[str] = None
    notes: Optional[str] = None
