"""Deviation & CAPA Log schemas (FSP-CAPA-LOG-001)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import ALCOAResponseMixin


class DeviationLogCreate(BaseModel):
    """Create a deviation log. operator_id comes from JWT."""
    source_log_type: str = Field(..., description="receiving, cooking, cooling, sanitising, assembly")
    source_log_id: int
    description: str = Field(..., min_length=5)
    severity: str = Field(default="Minor", description="Critical, Major, Minor")
    immediate_action: str = Field(..., description="Quarantine, Hold, Discard, Rework, Other")
    immediate_action_detail: Optional[str] = None
    root_cause: Optional[str] = None
    preventive_action: Optional[str] = None
    notes: Optional[str] = None


class DeviationLogUpdate(BaseModel):
    """Update CAPA fields on a deviation log."""
    root_cause: Optional[str] = None
    preventive_action: Optional[str] = None
    immediate_action_detail: Optional[str] = None
    notes: Optional[str] = None


class DeviationCloseRequest(BaseModel):
    """Close a deviation (CAPA completion)."""
    root_cause: str = Field(..., min_length=5)
    preventive_action: str = Field(..., min_length=5)
    closure_notes: Optional[str] = None


class DeviationLogResponse(ALCOAResponseMixin):
    """Deviation log response with ALCOA+ audit fields."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_log_type: str
    source_log_id: int
    description: str
    severity: str
    immediate_action: str
    immediate_action_detail: Optional[str] = None
    root_cause: Optional[str] = None
    preventive_action: Optional[str] = None
    closed_by: Optional[int] = None
    closed_at: Optional[datetime] = None
    closure_notes: Optional[str] = None
