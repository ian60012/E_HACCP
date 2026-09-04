"""
Shared Pydantic schema patterns used across all HACCP log schemas.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional, Generic, TypeVar, List, Annotated

from pydantic import BaseModel, ConfigDict, Field, AfterValidator

T = TypeVar("T")
SIGNATURE_DATA_URL_PREFIX = "data:image/png;base64,"
SIGNATURE_DATA_URL_MAX_LENGTH = 600_000


def validate_signature_data_url(value: str) -> str:
    """Validate canvas PNG data URLs without decoding large payloads."""
    if not value.startswith(SIGNATURE_DATA_URL_PREFIX):
        raise ValueError("signature must be a PNG data URL")
    if len(value) > SIGNATURE_DATA_URL_MAX_LENGTH:
        raise ValueError("signature image is too large")
    return value


SignatureDataUrl = Annotated[
    str,
    Field(min_length=len(SIGNATURE_DATA_URL_PREFIX) + 1, max_length=SIGNATURE_DATA_URL_MAX_LENGTH),
    AfterValidator(validate_signature_data_url),
]


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
    operator_signature_data_url: Optional[str] = None
    verified_by: Optional[int] = None
    verifier_name: Optional[str] = None
    verifier_signature_data_url: Optional[str] = None
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
    """Request body for QA lock operation. Verifier identity comes from JWT."""
    verifier_signature_data_url: SignatureDataUrl


# ---------------------------------------------------------------------------
# CCP validation result
# ---------------------------------------------------------------------------

class CCPValidationResult(BaseModel):
    """Standard CCP validation output used by all validators."""
    status: str  # "Pass", "Fail", or "Deviation"
    message: str
    requires_deviation: bool
    deviation_description: Optional[str] = None
