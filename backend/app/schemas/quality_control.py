"""Schemas for batch quality inspection, sample retention, and permissions."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import SignatureDataUrl

QualityResult = Literal["pass", "fail", "not_applicable"]
StorageCondition = Literal["ambient", "chilled", "frozen", "other"]


class QualityInspectionSave(BaseModel):
    inspection_at: Optional[datetime] = None
    color_result: Optional[QualityResult] = None
    aroma_result: Optional[QualityResult] = None
    taste_result: Optional[QualityResult] = None
    not_applicable_reason: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=4000)
    corrective_action: Optional[str] = Field(None, max_length=4000)
    retained_sample: Optional[bool] = None
    no_sample_reason: Optional[str] = Field(None, max_length=2000)
    sample_code: Optional[str] = Field(None, max_length=100)
    sample_quantity: Optional[Decimal] = Field(None, gt=0)
    sample_unit: Optional[str] = Field(None, max_length=30)
    sampled_at: Optional[datetime] = None
    storage_condition: Optional[StorageCondition] = None
    storage_location: Optional[str] = Field(None, max_length=200)
    disposal_due_date: Optional[date] = None


class QualityInspectionVerify(BaseModel):
    verifier_signature_data_url: SignatureDataUrl


class QualityInspectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: int
    revision: int
    status: str
    inspection_at: Optional[datetime] = None
    color_result: Optional[str] = None
    aroma_result: Optional[str] = None
    taste_result: Optional[str] = None
    not_applicable_reason: Optional[str] = None
    notes: Optional[str] = None
    corrective_action: Optional[str] = None
    retained_sample: Optional[bool] = None
    no_sample_reason: Optional[str] = None
    sample_code: Optional[str] = None
    sample_quantity: Optional[Decimal] = None
    sample_unit: Optional[str] = None
    sampled_at: Optional[datetime] = None
    storage_condition: Optional[str] = None
    storage_location: Optional[str] = None
    disposal_due_date: Optional[date] = None
    has_photo: bool = False
    photo_original_name: Optional[str] = None
    photo_content_type: Optional[str] = None
    photo_size_bytes: Optional[int] = None
    photo_uploaded_at: Optional[datetime] = None
    created_by: int
    created_by_name: Optional[str] = None
    created_at: datetime
    updated_by: int
    updated_by_name: Optional[str] = None
    updated_at: datetime
    verified_by: Optional[int] = None
    verifier_name: Optional[str] = None
    verified_at: Optional[datetime] = None
    verifier_signature_data_url: Optional[str] = None


class QualityPermissionFlags(BaseModel):
    can_view: bool
    can_edit: bool
    can_verify: bool


class QualityInspectionContext(BaseModel):
    batch_id: int
    batch_code: str
    product_name: str
    production_date: date
    process_type: Optional[str] = None
    is_voided: bool
    release_required: bool
    permissions: QualityPermissionFlags
    inspection: Optional[QualityInspectionResponse] = None


class QualityRolePermissionResponse(QualityPermissionFlags):
    role: str
    fixed: bool = False


class QualityRolePermissionUpdate(QualityPermissionFlags):
    role: Literal["QA", "Production", "Warehouse"]

    @model_validator(mode="after")
    def permission_dependencies(self):
        if (self.can_edit or self.can_verify) and not self.can_view:
            raise ValueError("Edit or verify permission requires view permission")
        return self


class QualityPermissionsConfig(BaseModel):
    enforcement_started_at: datetime
    roles: list[QualityRolePermissionResponse]


class QualityPermissionsUpdate(BaseModel):
    roles: list[QualityRolePermissionUpdate]
