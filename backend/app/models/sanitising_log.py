"""Sanitising & Cleaning Log model (FSP-LOG-CLN-001)."""

from sqlalchemy import Column, Integer, Text, ForeignKey, VARCHAR
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.enums import ChemicalType, PassFailType
from app.models.base import ALCOAMixin


class SanitisingLog(ALCOAMixin, Base):
    __tablename__ = "sanitising_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Business fields
    area_id = Column(Integer, ForeignKey("areas.id"), nullable=False)
    target_description = Column(Text, nullable=False)
    chemical = Column(ChemicalType, nullable=False)
    dilution_ratio = Column(VARCHAR(20), nullable=True)
    atp_result_rlu = Column(Integer, nullable=True)
    atp_status = Column(PassFailType, nullable=True)
    corrective_action = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    # Relationships
    area = relationship("Area", lazy="raise", foreign_keys=[area_id])
    operator = relationship("User", lazy="raise", foreign_keys="SanitisingLog.operator_id")
    verifier = relationship("User", lazy="raise", foreign_keys="SanitisingLog.verified_by")
