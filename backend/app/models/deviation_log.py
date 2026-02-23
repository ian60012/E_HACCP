"""Deviation & CAPA Log model (FSP-CAPA-LOG-001).

Uses polymorphic reference pattern: source_log_type + source_log_id
to link back to any of the 5 log tables. No FK constraint in DB
because PostgreSQL FKs cannot conditionally reference different tables.
"""

from sqlalchemy import Column, Integer, Text, ForeignKey
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.enums import LogTypeType, SeverityType, ImmediateActionType
from app.models.base import ALCOAMixin


class DeviationLog(ALCOAMixin, Base):
    __tablename__ = "deviation_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Polymorphic source reference
    source_log_type = Column(LogTypeType, nullable=False)
    source_log_id = Column(Integer, nullable=False)

    # Deviation details
    description = Column(Text, nullable=False)
    severity = Column(SeverityType, nullable=False, server_default="Minor")
    immediate_action = Column(ImmediateActionType, nullable=False)
    immediate_action_detail = Column(Text, nullable=True)

    # CAPA (Corrective And Preventive Action)
    root_cause = Column(Text, nullable=True)
    preventive_action = Column(Text, nullable=True)

    # Closure
    closed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    closed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    closure_notes = Column(Text, nullable=True)

    # Relationships
    operator = relationship("User", lazy="raise", foreign_keys="DeviationLog.operator_id")
    verifier = relationship("User", lazy="raise", foreign_keys="DeviationLog.verified_by")
    closer = relationship("User", lazy="raise", foreign_keys=[closed_by])
