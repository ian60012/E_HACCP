"""Daily Batch Sheet models (FSP-LOG-017)."""

from sqlalchemy import Column, Integer, Numeric, Text, ForeignKey, VARCHAR, Boolean
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ProdDailyBatchSheet(Base):
    """One batch sheet per production batch (header)."""
    __tablename__ = "prod_daily_batch_sheets"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("prod_batches.id", ondelete="CASCADE"), nullable=False, unique=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    operator_name = Column(VARCHAR(100), nullable=True)
    verified_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    verified_at = Column(TIMESTAMP(timezone=True), nullable=True)
    is_locked = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    batch = relationship("ProdBatch", lazy="raise", foreign_keys=[batch_id])
    operator = relationship("User", lazy="raise", foreign_keys=[operator_id])
    verifier = relationship("User", lazy="raise", foreign_keys=[verified_by])
    lines = relationship(
        "ProdBatchSheetLine",
        back_populates="sheet",
        lazy="raise",
        cascade="all, delete-orphan",
        order_by="ProdBatchSheetLine.seq",
    )


class ProdBatchSheetLine(Base):
    """One ingredient line within a batch sheet."""
    __tablename__ = "prod_batch_sheet_lines"

    id = Column(Integer, primary_key=True, index=True)
    sheet_id = Column(Integer, ForeignKey("prod_daily_batch_sheets.id", ondelete="CASCADE"), nullable=False)
    inv_item_id = Column(Integer, ForeignKey("inv_items.id", ondelete="SET NULL"), nullable=True)
    ingredient_name = Column(VARCHAR(200), nullable=False)
    receiving_log_id = Column(Integer, ForeignKey("receiving_logs.id", ondelete="SET NULL"), nullable=True)
    is_used = Column(Boolean, nullable=False, default=False, server_default="false")
    supplier = Column(VARCHAR(200), nullable=True)
    supplier_batch_no = Column(VARCHAR(100), nullable=True)
    qty_used = Column(Numeric(12, 3), nullable=True)
    unit = Column(VARCHAR(20), nullable=True)
    seq = Column(Integer, nullable=False, default=0)

    sheet = relationship("ProdDailyBatchSheet", back_populates="lines", lazy="raise")
    inv_item = relationship("InvItem", lazy="raise", foreign_keys=[inv_item_id])
    receiving_log = relationship("ReceivingLog", lazy="raise", foreign_keys=[receiving_log_id])
