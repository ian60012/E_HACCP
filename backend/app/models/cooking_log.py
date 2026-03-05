"""Cooking CCP Log model (FSP-LOG-004)."""

from sqlalchemy import Column, Integer, Numeric, Text, ForeignKey, VARCHAR
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.enums import CCPStatusType
from app.models.base import ALCOAMixin


class CookingLog(ALCOAMixin, Base):
    __tablename__ = "cooking_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Business fields
    batch_id = Column(VARCHAR(50), nullable=False, index=True)
    prod_batch_id = Column(Integer, ForeignKey("prod_batches.id", ondelete="SET NULL"), nullable=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=True)
    start_time = Column(TIMESTAMP(timezone=True), nullable=False)
    end_time = Column(TIMESTAMP(timezone=True), nullable=True)
    core_temp = Column(Numeric(5, 2), nullable=True)
    ccp_status = Column(CCPStatusType, nullable=True)
    corrective_action = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    # Relationships (lazy="raise" prevents N+1 — must use selectinload())
    product = relationship("Product", lazy="raise", foreign_keys=[product_id])
    equipment = relationship("Equipment", lazy="raise", foreign_keys=[equipment_id])
    operator = relationship("User", lazy="raise", foreign_keys="CookingLog.operator_id")
    verifier = relationship("User", lazy="raise", foreign_keys="CookingLog.verified_by")
    prod_batch = relationship("ProdBatch", lazy="raise", foreign_keys=[prod_batch_id], back_populates="cooking_logs")
