"""Cooking CCP Log schemas (FSP-LOG-004)."""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import ALCOAResponseMixin


class CookingLogCreate(BaseModel):
    """Create a cooking log. operator_id comes from JWT (not request body)."""
    batch_id: str = Field(..., max_length=50)
    prod_batch_id: Optional[int] = None
    hot_input_id: Optional[int] = None
    prod_product_id: Optional[int] = None
    equipment_id: Optional[int] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    core_temp: Optional[Decimal] = Field(None, ge=0, le=250)
    corrective_action: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def validate_time_order(self):
        if self.end_time and self.start_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class CookingLogUpdate(BaseModel):
    """Update a cooking log (only allowed on non-locked records)."""
    prod_batch_id: Optional[int] = None
    end_time: Optional[datetime] = None
    core_temp: Optional[Decimal] = Field(None, ge=0, le=250)
    corrective_action: Optional[str] = None
    notes: Optional[str] = None


class CookingLogResponse(ALCOAResponseMixin):
    """Cooking log response with ALCOA+ audit fields."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: str
    prod_batch_id: Optional[int] = None
    hot_input_id: Optional[int] = None
    prod_product_id: Optional[int] = None
    prod_product_name: Optional[str] = None
    product_name: Optional[str] = None
    equipment_id: Optional[int] = None
    equipment_name: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    core_temp: Optional[Decimal] = None
    ccp_status: Optional[str] = None
    corrective_action: Optional[str] = None
    notes: Optional[str] = None
