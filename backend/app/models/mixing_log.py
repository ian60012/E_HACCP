"""Mixing Log model (FSP-LOG-MIX-001)."""

from sqlalchemy import Column, Integer, Numeric, Text, ForeignKey, VARCHAR
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import ALCOAMixin


class MixingLog(ALCOAMixin, Base):
    __tablename__ = "mixing_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Business fields
    batch_id = Column(VARCHAR(50), nullable=False, index=True)
    prod_batch_id = Column(Integer, ForeignKey("prod_batches.id", ondelete="SET NULL"), nullable=True, index=True)
    prod_product_id = Column(Integer, ForeignKey("prod_products.id", ondelete="RESTRICT"), nullable=True)
    weight_kg = Column(Numeric(12, 3), nullable=True)
    initial_temp = Column(Numeric(5, 2), nullable=True)
    final_temp = Column(Numeric(5, 2), nullable=True)
    start_time = Column(TIMESTAMP(timezone=True), nullable=False)
    end_time = Column(TIMESTAMP(timezone=True), nullable=True)
    corrective_action = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    # Relationships
    prod_product = relationship("ProdProduct", lazy="raise", foreign_keys=[prod_product_id])
    operator = relationship("User", lazy="raise", foreign_keys="MixingLog.operator_id")
    verifier = relationship("User", lazy="raise", foreign_keys="MixingLog.verified_by")
    prod_batch = relationship("ProdBatch", lazy="raise", foreign_keys=[prod_batch_id])
