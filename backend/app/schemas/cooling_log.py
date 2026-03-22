"""Cooling CCP Log schemas (FSP-LOG-005) — most complex validation."""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import ALCOAResponseMixin


class CoolingLogCreate(BaseModel):
    """Create a cooling log. Supports progressive recording (start -> stage1 -> end).
    If goes_to_freezer=True, only Stage 1 is required; end data is not needed.
    """
    batch_id: str = Field(..., max_length=50)
    prod_batch_id: Optional[int] = None
    hot_input_id: Optional[int] = None
    start_time: datetime
    start_temp: Decimal = Field(..., ge=0, le=120)
    stage1_time: Optional[datetime] = None
    stage1_temp: Optional[Decimal] = Field(None, ge=-10, le=120)
    end_time: Optional[datetime] = None
    end_temp: Optional[Decimal] = Field(None, ge=-10, le=120)
    goes_to_freezer: bool = False
    corrective_action: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def validate_progressive_times(self):
        """Validate time ordering: start < stage1 < end."""
        if self.stage1_time and self.stage1_time <= self.start_time:
            raise ValueError("stage1_time must be after start_time")
        if self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        if self.stage1_time and self.end_time and self.end_time <= self.stage1_time:
            raise ValueError("end_time must be after stage1_time")
        return self

    @model_validator(mode="after")
    def validate_stage1_consistency(self):
        """Both stage1 fields must be present or both absent."""
        has_time = self.stage1_time is not None
        has_temp = self.stage1_temp is not None
        if has_time != has_temp:
            raise ValueError("stage1_time and stage1_temp must both be provided or both omitted")
        return self

    @model_validator(mode="after")
    def validate_end_consistency(self):
        """Both end fields must be present or both absent."""
        has_time = self.end_time is not None
        has_temp = self.end_temp is not None
        if has_time != has_temp:
            raise ValueError("end_time and end_temp must both be provided or both omitted")
        return self


class CoolingLogUpdate(BaseModel):
    """Progressive update: add stage1 or end data to an in-progress cooling log."""
    stage1_time: Optional[datetime] = None
    stage1_temp: Optional[Decimal] = Field(None, ge=-10, le=120)
    end_time: Optional[datetime] = None
    end_temp: Optional[Decimal] = Field(None, ge=-10, le=120)
    goes_to_freezer: Optional[bool] = None
    corrective_action: Optional[str] = None
    notes: Optional[str] = None


class CoolingLogResponse(ALCOAResponseMixin):
    """Cooling log response with generated duration columns."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: str
    prod_batch_id: Optional[int] = None
    hot_input_id: Optional[int] = None
    start_time: datetime
    start_temp: Decimal
    stage1_time: Optional[datetime] = None
    stage1_temp: Optional[Decimal] = None
    end_time: Optional[datetime] = None
    end_temp: Optional[Decimal] = None
    goes_to_freezer: bool = False
    stage1_duration_minutes: Optional[Decimal] = None
    total_duration_minutes: Optional[Decimal] = None
    ccp_status: Optional[str] = None
    corrective_action: Optional[str] = None
    notes: Optional[str] = None
