"""Assembly & Packing Log schemas (FSP-LOG-ASM-001)."""

from datetime import datetime
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import ALCOAResponseMixin


class AssemblyPackingLogCreate(BaseModel):
    """Create an assembly & packing log. operator_id comes from JWT."""
    batch_id: str = Field(..., max_length=50)
    product_id: int
    is_allergen_declared: bool
    is_date_code_correct: Optional[bool] = None
    label_photo_path: Optional[str] = Field(None, max_length=500)
    target_weight_g: Optional[Decimal] = Field(None, gt=0)
    sample_1_g: Optional[Decimal] = Field(None, gt=0)
    sample_2_g: Optional[Decimal] = Field(None, gt=0)
    sample_3_g: Optional[Decimal] = Field(None, gt=0)
    sample_4_g: Optional[Decimal] = Field(None, gt=0)
    sample_5_g: Optional[Decimal] = Field(None, gt=0)
    seal_integrity: Optional[str] = Field(None, description="Pass or Fail")
    coding_legibility: Optional[str] = Field(None, description="Pass or Fail")
    corrective_action: Optional[str] = None
    notes: Optional[str] = None


class AssemblyPackingLogUpdate(BaseModel):
    """Update an assembly & packing log."""
    is_date_code_correct: Optional[bool] = None
    label_photo_path: Optional[str] = Field(None, max_length=500)
    sample_1_g: Optional[Decimal] = Field(None, gt=0)
    sample_2_g: Optional[Decimal] = Field(None, gt=0)
    sample_3_g: Optional[Decimal] = Field(None, gt=0)
    sample_4_g: Optional[Decimal] = Field(None, gt=0)
    sample_5_g: Optional[Decimal] = Field(None, gt=0)
    seal_integrity: Optional[str] = None
    coding_legibility: Optional[str] = None
    corrective_action: Optional[str] = None
    notes: Optional[str] = None


class AssemblyPackingLogResponse(ALCOAResponseMixin):
    """Assembly & packing log response with generated average weight."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: str
    product_id: int
    product_name: Optional[str] = None
    is_allergen_declared: bool
    is_date_code_correct: Optional[bool] = None
    label_photo_path: Optional[str] = None
    target_weight_g: Optional[Decimal] = None
    sample_1_g: Optional[Decimal] = None
    sample_2_g: Optional[Decimal] = None
    sample_3_g: Optional[Decimal] = None
    sample_4_g: Optional[Decimal] = None
    sample_5_g: Optional[Decimal] = None
    average_weight_g: Optional[Decimal] = None  # Generated column
    seal_integrity: Optional[str] = None
    coding_legibility: Optional[str] = None
    corrective_action: Optional[str] = None
    notes: Optional[str] = None
    warnings: Optional[List[str]] = None  # Populated by assembly validator
