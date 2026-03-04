"""Inventory module models (出入庫管理)."""

from sqlalchemy import Column, Integer, Numeric, Text, ForeignKey, VARCHAR, Boolean
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.enums import InvDocTypeType, InvDocStatusType


class InvItem(Base):
    __tablename__ = "inv_items"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(VARCHAR(50), unique=True, nullable=False)
    name = Column(VARCHAR(200), nullable=False)
    category = Column(VARCHAR(100), nullable=True)
    base_unit = Column(VARCHAR(20), nullable=False, server_default="PCS")
    description = Column(Text, nullable=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default="true")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    supplier = relationship("Supplier", lazy="raise", foreign_keys=[supplier_id])
    lines = relationship("InvStockLine", back_populates="item", lazy="raise")


class InvLocation(Base):
    __tablename__ = "inv_locations"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(VARCHAR(50), unique=True, nullable=False)
    name = Column(VARCHAR(200), nullable=False)
    zone = Column(VARCHAR(100), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default="true")


class InvStockDoc(Base):
    __tablename__ = "inv_stock_docs"

    id = Column(Integer, primary_key=True, index=True)
    doc_number = Column(VARCHAR(30), unique=True, nullable=False)
    doc_type = Column(InvDocTypeType, nullable=False)
    status = Column(InvDocStatusType, nullable=False, server_default="Draft")
    location_id = Column(Integer, ForeignKey("inv_locations.id"), nullable=True)
    receiving_log_id = Column(Integer, ForeignKey("receiving_logs.id"), nullable=True)
    ref_number = Column(VARCHAR(100), nullable=True)
    notes = Column(Text, nullable=True)
    void_reason = Column(Text, nullable=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    operator_name = Column(VARCHAR(100), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    posted_at = Column(TIMESTAMP(timezone=True), nullable=True)
    voided_at = Column(TIMESTAMP(timezone=True), nullable=True)

    location = relationship("InvLocation", lazy="raise", foreign_keys=[location_id])
    operator = relationship("User", lazy="raise", foreign_keys=[operator_id])
    receiving_log = relationship("ReceivingLog", lazy="raise", foreign_keys=[receiving_log_id])
    lines = relationship("InvStockLine", back_populates="doc", lazy="raise",
                         cascade="all, delete-orphan")


class InvStockLine(Base):
    __tablename__ = "inv_stock_lines"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(Integer, ForeignKey("inv_stock_docs.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(Integer, ForeignKey("inv_items.id"), nullable=False)
    quantity = Column(Numeric(12, 3), nullable=False)
    unit = Column(VARCHAR(20), nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=True)
    notes = Column(Text, nullable=True)

    doc = relationship("InvStockDoc", back_populates="lines", lazy="raise")
    item = relationship("InvItem", back_populates="lines", lazy="raise")


class InvStockBalance(Base):
    __tablename__ = "inv_stock_balance"

    item_id = Column(Integer, ForeignKey("inv_items.id"), primary_key=True)
    location_id = Column(Integer, ForeignKey("inv_locations.id"), primary_key=True)
    quantity = Column(Numeric(12, 3), nullable=False, server_default="0")

    item = relationship("InvItem", lazy="raise", foreign_keys=[item_id])
    location = relationship("InvLocation", lazy="raise", foreign_keys=[location_id])


class InvStockMovement(Base):
    __tablename__ = "inv_stock_movements"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(Integer, ForeignKey("inv_stock_docs.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("inv_items.id"), nullable=False)
    location_id = Column(Integer, ForeignKey("inv_locations.id"), nullable=False)
    delta = Column(Numeric(12, 3), nullable=False)
    balance_after = Column(Numeric(12, 3), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    item = relationship("InvItem", lazy="raise", foreign_keys=[item_id])
    location = relationship("InvLocation", lazy="raise", foreign_keys=[location_id])
