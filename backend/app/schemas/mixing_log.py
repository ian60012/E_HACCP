"""Mixing Log schemas (FSP-LOG-MIX-001)."""

from datetime import datetime
from typing import Optional
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ALCOAResponseMixin


class MixingLogCreate(BaseModel):
    """Create a mixing log. operator_id comes from JWT."""
    batch_id: str = Field(..., min_length=1, max_length=50)
    prod_product_id: Optional[int] = None
    prod_batch_id: Optional[int] = None
    weight_kg: Optional[Decimal] = Field(None, ge=0)
    initial_temp: Optional[Decimal] = None
    final_temp: Optional[Decimal] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    corrective_action: Optional[str] = None
    notes: Optional[str] = None


class MixingLogUpdate(BaseModel):
    """Update a mixing log."""
    weight_kg: Optional[Decimal] = Field(None, ge=0)
    initial_temp: Optional[Decimal] = None
    final_temp: Optional[Decimal] = None
    end_time: Optional[datetime] = None
    corrective_action: Optional[str] = None
    notes: Optional[str] = None


class MixingLogResponse(ALCOAResponseMixin):
    """Mixing log response with ALCOA+ audit fields."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: str
    prod_batch_id: Optional[int] = None
    prod_product_id: Optional[int] = None
    product_name: Optional[str] = None
    product_code: Optional[str] = None
    weight_kg: Optional[Decimal] = None
    initial_temp: Optional[Decimal] = None
    final_temp: Optional[Decimal] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    corrective_action: Optional[str] = None
    notes: Optional[str] = None
