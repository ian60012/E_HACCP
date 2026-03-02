"""Receiving Log schemas (FSP-LOG-001)."""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import ALCOAResponseMixin


QUANTITY_UNITS = ("KG", "包", "箱", "袋", "罐", "卷")


class ReceivingLogCreate(BaseModel):
    """Create a receiving log. operator_id comes from JWT."""
    supplier_id: int
    po_number: Optional[str] = Field(None, max_length=50)
    product_name: str = Field(..., max_length=200)
    quantity: Optional[Decimal] = Field(None, ge=0, le=99999)
    quantity_unit: Optional[str] = Field(None, max_length=10)
    temp_chilled: Optional[Decimal] = Field(None, ge=-50, le=50)
    temp_frozen: Optional[Decimal] = Field(None, ge=-80, le=0)
    vehicle_cleanliness: str = Field(..., description="Pass or Fail")
    packaging_integrity: str = Field(..., description="Pass or Fail")
    acceptance_status: str = Field(default="Accept", description="Accept, Reject, or Hold")
    corrective_action: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def validate_corrective_action(self):
        if self.acceptance_status != "Accept" and not self.corrective_action:
            raise ValueError("corrective_action is required when acceptance_status is not Accept")
        return self


class ReceivingLogUpdate(BaseModel):
    """Update a receiving log (only allowed on non-locked records)."""
    acceptance_status: Optional[str] = None
    corrective_action: Optional[str] = None
    notes: Optional[str] = None


class ReceivingLogResponse(ALCOAResponseMixin):
    """Receiving log response with ALCOA+ audit fields."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    supplier_id: int
    supplier_name: Optional[str] = None
    po_number: Optional[str] = None
    product_name: str
    quantity: Optional[Decimal] = None
    quantity_unit: Optional[str] = None
    temp_chilled: Optional[Decimal] = None
    temp_frozen: Optional[Decimal] = None
    vehicle_cleanliness: str
    packaging_integrity: str
    acceptance_status: str
    corrective_action: Optional[str] = None
    notes: Optional[str] = None
