"""Assembly & Packing Inspection Log schemas (FSP-LOG-APK-001)."""

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ALCOAResponseMixin


class AssemblyPackingLogCreate(BaseModel):
    prod_batch_id: int
    is_allergen_declared: bool
    is_date_code_correct: Optional[bool] = None
    target_weight_g: Optional[Decimal] = Field(None, gt=0)
    sample_1_g: Optional[Decimal] = Field(None, gt=0)
    sample_2_g: Optional[Decimal] = Field(None, gt=0)
    sample_3_g: Optional[Decimal] = Field(None, gt=0)
    sample_4_g: Optional[Decimal] = Field(None, gt=0)
    sample_5_g: Optional[Decimal] = Field(None, gt=0)
    seal_integrity: Optional[str] = None
    coding_legibility: Optional[str] = None
    corrective_action: Optional[str] = None
    notes: Optional[str] = None


class AssemblyPackingLogUpdate(BaseModel):
    is_allergen_declared: Optional[bool] = None
    is_date_code_correct: Optional[bool] = None
    target_weight_g: Optional[Decimal] = Field(None, gt=0)
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
    model_config = ConfigDict(from_attributes=True)

    id: int
    prod_batch_id: int
    prod_batch_code: Optional[str] = None
    is_allergen_declared: bool
    is_date_code_correct: Optional[bool] = None
    target_weight_g: Optional[Decimal] = None
    sample_1_g: Optional[Decimal] = None
    sample_2_g: Optional[Decimal] = None
    sample_3_g: Optional[Decimal] = None
    sample_4_g: Optional[Decimal] = None
    sample_5_g: Optional[Decimal] = None
    average_weight_g: Optional[Decimal] = None
    seal_integrity: Optional[str] = None
    coding_legibility: Optional[str] = None
    corrective_action: Optional[str] = None
    notes: Optional[str] = None
