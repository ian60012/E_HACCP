"""Versioned meat processing records. Detail rows are append-only."""
from sqlalchemy import Column, Integer, Text, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class MeatRecord(Base):
    __tablename__ = "prod_meat_records"
    __table_args__ = (UniqueConstraint("batch_id", "version"),)
    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("prod_batches.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    state = Column(String(20), nullable=False, server_default="draft")
    difference_reason = Column(Text, nullable=False, server_default="")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    completed_by = Column(Integer, ForeignKey("users.id"))
    completed_at = Column(TIMESTAMP(timezone=True))
    operator_signature_data_url = Column(Text)
    verified_by = Column(Integer, ForeignKey("users.id"))
    verified_at = Column(TIMESTAMP(timezone=True))
    verifier_signature_data_url = Column(Text)
    inputs = relationship("MeatInput", lazy="raise", order_by="MeatInput.id")
    steps = relationship("MeatStep", lazy="raise", order_by="MeatStep.seq")
    outputs = relationship("MeatOutput", lazy="raise", order_by="MeatOutput.id")
    losses = relationship("MeatLoss", lazy="raise", order_by="MeatLoss.id")


class MeatInput(Base):
    __tablename__ = "prod_meat_inputs"
    id = Column(Integer, primary_key=True)
    record_id = Column(Integer, ForeignKey("prod_meat_records.id"), nullable=False, index=True)
    inv_item_id = Column(Integer, ForeignKey("inv_items.id"), nullable=False)
    item_name = Column(String(200), nullable=False)
    supplier = Column(String(200), nullable=False)
    source_batch = Column(String(100), nullable=False)
    receiving_log_id = Column(Integer, ForeignKey("receiving_logs.id"))
    weight_kg = Column(Numeric(12, 3), nullable=False)
    source_location_id = Column(Integer, ForeignKey("inv_locations.id", ondelete="RESTRICT"), nullable=True)
    source_lot_id = Column(Integer, ForeignKey("inv_lots.id", ondelete="RESTRICT"), nullable=True)
    source_location_name = Column(String(200), nullable=True)
    source_lot_code = Column(String(100), nullable=True)


class MeatStep(Base):
    __tablename__ = "prod_meat_steps"
    id = Column(Integer, primary_key=True)
    record_id = Column(Integer, ForeignKey("prod_meat_records.id"), nullable=False, index=True)
    seq = Column(Integer, nullable=False)
    kind = Column(String(30), nullable=False)
    start_time = Column(TIMESTAMP(timezone=True))
    end_time = Column(TIMESTAMP(timezone=True))
    operator = Column(String(100), nullable=False)
    temperature_c = Column(Numeric(5, 2))
    measured_at = Column(TIMESTAMP(timezone=True))
    notes = Column(Text, nullable=False, server_default="")


class MeatOutput(Base):
    __tablename__ = "prod_meat_outputs"
    id = Column(Integer, primary_key=True)
    record_id = Column(Integer, ForeignKey("prod_meat_records.id"), nullable=False, index=True)
    inv_item_id = Column(Integer, ForeignKey("inv_items.id"), nullable=False)
    item_name = Column(String(200), nullable=False)
    weight_kg = Column(Numeric(12, 3), nullable=False)
    pack_count = Column(Integer)
    pack_type = Column(String(50))
    location_id = Column(Integer, ForeignKey("inv_locations.id"), nullable=False)
    location_name = Column(String(200), nullable=False)


class MeatLoss(Base):
    __tablename__ = "prod_meat_losses"
    id = Column(Integer, primary_key=True)
    record_id = Column(Integer, ForeignKey("prod_meat_records.id"), nullable=False, index=True)
    kind = Column(String(100), nullable=False)
    weight_kg = Column(Numeric(12, 3), nullable=False)
    notes = Column(Text, nullable=False, server_default="")
