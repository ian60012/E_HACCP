"""
Shared Pydantic schema patterns used across all HACCP log schemas.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional, Generic, TypeVar, List

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

class PaginatedResponse(BaseModel, Generic[T]):
    """Wrapper for paginated list responses."""
    items: List[T]
    total: int
    skip: int
    limit: int


# ---------------------------------------------------------------------------
# ALCOA+ audit fields for log responses
# ---------------------------------------------------------------------------

class ALCOAResponseMixin(BaseModel):
    """ALCOA+ audit fields included in all log responses."""
    operator_id: int
    operator_name: Optional[str] = None
    verified_by: Optional[int] = None
    verifier_name: Optional[str] = None
    is_locked: bool
    is_voided: bool
    void_reason: Optional[str] = None
    voided_at: Optional[datetime] = None
    voided_by: Optional[int] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Common request schemas
# ---------------------------------------------------------------------------

class VoidRequest(BaseModel):
    """Request body for voiding a record."""
    void_reason: str = Field(
        ...,
        min_length=5,
        max_length=1000,
        description="Reason for voiding this record (ALCOA+ requirement)",
    )


class QALockRequest(BaseModel):
    """Request body for QA lock operation (empty — verifier comes from JWT)."""
    pass


# ---------------------------------------------------------------------------
# CCP validation result
# ---------------------------------------------------------------------------

class CCPValidationResult(BaseModel):
    """Standard CCP validation output used by all validators."""
    status: str  # "Pass", "Fail", or "Deviation"
    message: str
    requires_deviation: bool
    deviation_description: Optional[str] = None
