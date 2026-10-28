"""Daily production-line cleaning checklist model (FSP-LOG-CLN-003/005)."""

from sqlalchemy import Column, Date, Integer, Text, VARCHAR
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import ALCOAMixin


class CleaningChecklist(ALCOAMixin, Base):
    __tablename__ = "cleaning_checklists"

    id = Column(Integer, primary_key=True, index=True)
    check_date = Column(Date, nullable=False, index=True)
    line_type = Column(VARCHAR(20), nullable=False, index=True)
    items = Column(JSONB, nullable=False)
    notes = Column(Text, nullable=True)

    operator = relationship("User", lazy="raise", foreign_keys="CleaningChecklist.operator_id")
    verifier = relationship("User", lazy="raise", foreign_keys="CleaningChecklist.verified_by")
