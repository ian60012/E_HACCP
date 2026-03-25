"""PPE Compliance Log model (FSP-LOG-PPE-001)."""

from sqlalchemy import Column, Integer, Text, Date, ForeignKey, VARCHAR
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.enums import PassFailType
from app.models.base import ALCOAMixin


class PPEComplianceLog(ALCOAMixin, Base):
    __tablename__ = "ppe_compliance_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Business fields
    check_date = Column(Date, nullable=False)
    area_id = Column(Integer, ForeignKey("areas.id"), nullable=False)
    staff_count = Column(Integer, nullable=False)

    # 9 PPE check items
    hair_net = Column(PassFailType, nullable=False)
    beard_net = Column(PassFailType, nullable=False)
    clean_uniform = Column(PassFailType, nullable=False)
    no_nail_polish = Column(PassFailType, nullable=False)
    safety_shoes = Column(PassFailType, nullable=False)
    single_use_mask = Column(PassFailType, nullable=False)
    no_jewellery = Column(PassFailType, nullable=False)
    hand_hygiene = Column(PassFailType, nullable=False)
    gloves = Column(PassFailType, nullable=False)

    # Actions & CAPA
    details_actions = Column(Text, nullable=True)
    capa_no = Column(VARCHAR(50), nullable=True)

    # Review
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(Date, nullable=True)

    # Relationships
    area = relationship("Area", lazy="raise", foreign_keys=[area_id])
    operator = relationship("User", lazy="raise", foreign_keys="PPEComplianceLog.operator_id")
    verifier = relationship("User", lazy="raise", foreign_keys="PPEComplianceLog.verified_by")
    reviewer = relationship("User", lazy="raise", foreign_keys=[reviewed_by])
