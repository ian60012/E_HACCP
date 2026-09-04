"""
ALCOA+ audit fields mixin for all HACCP log tables.

Every log table (receiving, cooking, cooling, sanitising, assembly, deviation)
inherits this mixin to get standardized audit trail fields:

  operator_id   - WHO recorded the entry (Attributable)
  created_at    - WHEN it was recorded (Contemporaneous, auto-stamped)
  verified_by   - WHO reviewed it (QA verification)
  is_locked     - Locked after QA review (no further edits)
  is_voided     - Soft delete (never hard delete)
  void_reason   - Reason for voiding
  voided_at     - When voided
  voided_by     - Who voided
"""

from sqlalchemy import Column, Integer, Boolean, Text, ForeignKey
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import declared_attr
from sqlalchemy.sql import func


class ALCOAMixin:
    """
    Mixin providing ALCOA+ audit fields for all log tables.

    ForeignKey columns use @declared_attr to ensure proper per-table
    column creation (avoids "Column already attached" errors in mixins).

    __allow_unmapped__ = True prevents SQLAlchemy from misinterpreting
    @declared_attr return type annotations as mapped columns.
    """

    __allow_unmapped__ = True

    @declared_attr
    def operator_id(cls):
        return Column(Integer, ForeignKey("users.id"), nullable=False)

    @declared_attr
    def verified_by(cls):
        return Column(Integer, ForeignKey("users.id"), nullable=True)

    is_locked = Column(Boolean, nullable=False, default=False, server_default="false")
    is_voided = Column(Boolean, nullable=False, default=False, server_default="false")
    void_reason = Column(Text, nullable=True)
    voided_at = Column(TIMESTAMP(timezone=True), nullable=True)

    @declared_attr
    def voided_by(cls):
        return Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
