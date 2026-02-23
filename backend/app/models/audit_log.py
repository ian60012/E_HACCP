"""Audit Log model — ALCOA+ change tracking with JSONB before/after values."""

from sqlalchemy import Column, Integer, Text, ForeignKey, VARCHAR
from sqlalchemy.dialects.postgresql import TIMESTAMP, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    table_name = Column(VARCHAR(50), nullable=False)
    record_id = Column(Integer, nullable=False)
    action = Column(VARCHAR(20), nullable=False)  # UPDATE, VOID, LOCK, VERIFY
    changed_fields = Column(JSONB, nullable=True)
    old_values = Column(JSONB, nullable=True)
    new_values = Column(JSONB, nullable=True)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    changed_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    reason = Column(Text, nullable=True)

    # Relationship
    changer = relationship("User", lazy="raise", foreign_keys=[changed_by])
