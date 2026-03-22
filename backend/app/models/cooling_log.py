"""
Cooling CCP Log model (FSP-LOG-005).

Most complex model with GENERATED ALWAYS AS STORED columns for duration
calculations. Uses SQLAlchemy Computed() — ORM never INSERT/UPDATEs these.

CCP Rules (enforced in backend services, not DB constraints):
  Stage 1: 60 deg C -> 21 deg C within 2 hours (120 min)
  Total:   60 deg C -> <5 deg C  within 6 hours (360 min)
"""

from sqlalchemy import Column, Integer, Numeric, Text, VARCHAR, Computed, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.enums import CCPStatusType
from app.models.base import ALCOAMixin


class CoolingLog(ALCOAMixin, Base):
    __tablename__ = "cooling_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Business fields
    batch_id = Column(VARCHAR(50), nullable=False, index=True)
    prod_batch_id = Column(Integer, ForeignKey("prod_batches.id", ondelete="SET NULL"), nullable=True, index=True)
    hot_input_id = Column(Integer, ForeignKey("prod_hot_inputs.id", ondelete="SET NULL"), nullable=True, index=True)
    start_time = Column(TIMESTAMP(timezone=True), nullable=False)
    start_temp = Column(Numeric(5, 2), nullable=False)
    stage1_time = Column(TIMESTAMP(timezone=True), nullable=True)
    stage1_temp = Column(Numeric(5, 2), nullable=True)
    end_time = Column(TIMESTAMP(timezone=True), nullable=True)
    end_temp = Column(Numeric(5, 2), nullable=True)
    goes_to_freezer = Column(Boolean, nullable=False, default=False)

    # Generated columns (STORED — auto-computed by PostgreSQL)
    stage1_duration_minutes = Column(
        Numeric(8, 2),
        Computed(
            "CASE WHEN stage1_time IS NOT NULL AND start_time IS NOT NULL "
            "THEN EXTRACT(EPOCH FROM (stage1_time - start_time)) / 60.0 "
            "ELSE NULL END",
            persisted=True,
        ),
    )
    total_duration_minutes = Column(
        Numeric(8, 2),
        Computed(
            "CASE WHEN end_time IS NOT NULL AND start_time IS NOT NULL "
            "THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 60.0 "
            "ELSE NULL END",
            persisted=True,
        ),
    )

    ccp_status = Column(CCPStatusType, nullable=True)
    corrective_action = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    # Relationships
    operator = relationship("User", lazy="raise", foreign_keys="CoolingLog.operator_id")
    verifier = relationship("User", lazy="raise", foreign_keys="CoolingLog.verified_by")
