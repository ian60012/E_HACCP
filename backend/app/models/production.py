"""Production module models (生產系統)."""

from sqlalchemy import Column, Integer, Numeric, Text, Date, ForeignKey, VARCHAR, Boolean
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.enums import ProdBatchStatusType, ProdShiftType, ProdProductTypeType


class ProdPackTypeConfig(Base):
    __tablename__ = "prod_pack_types"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(VARCHAR(50), unique=True, nullable=False)
    name = Column(VARCHAR(200), nullable=False)
    applicable_type = Column(VARCHAR(20), nullable=False, server_default="both")
    nominal_weight_kg = Column(Numeric(8, 3), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default="true")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())


class ProdProduct(Base):
    __tablename__ = "prod_products"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(VARCHAR(50), unique=True, nullable=False)
    name = Column(VARCHAR(200), nullable=False)
    ccp_limit_temp = Column(Numeric(5, 2), nullable=False, server_default="75.00")
    pack_size_kg = Column(Numeric(8, 3), nullable=True)
    loss_rate_warn_pct = Column(Numeric(5, 2), nullable=True)
    product_type = Column(ProdProductTypeType, nullable=False, server_default="forming")
    inv_item_id = Column(Integer, ForeignKey("inv_items.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default="true")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())


class ProdBatch(Base):
    __tablename__ = "prod_batches"

    id = Column(Integer, primary_key=True, index=True)
    batch_code = Column(VARCHAR(50), unique=True, nullable=False)
    product_code = Column(VARCHAR(50), nullable=False)
    product_name = Column(VARCHAR(200), nullable=False)
    production_date = Column(Date, nullable=False)
    shift = Column(ProdShiftType, nullable=True)
    spec_piece_weight_g = Column(Numeric(8, 2), nullable=False)
    start_time = Column(TIMESTAMP(timezone=True), nullable=True)
    end_time = Column(TIMESTAMP(timezone=True), nullable=True)
    status = Column(ProdBatchStatusType, nullable=False, server_default="open")
    operator = Column(VARCHAR(100), nullable=True)
    supervisor = Column(VARCHAR(100), nullable=True)
    estimated_forming_net_weight_kg = Column(Numeric(12, 3), nullable=True)
    estimated_forming_pieces = Column(Integer, nullable=True)
    input_weight_kg = Column(Numeric(12, 3), nullable=True)
    contamination_found = Column(Boolean, nullable=False, server_default="false")
    change_over = Column(Boolean, nullable=False, server_default="false")
    inv_stock_doc_id = Column(Integer, ForeignKey("inv_stock_docs.id", ondelete="SET NULL"), nullable=True)
    is_voided = Column(Boolean, nullable=False, default=False, server_default="false")
    void_reason = Column(Text, nullable=True)
    voided_at = Column(TIMESTAMP(timezone=True), nullable=True)
    voided_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    forming_trolleys = relationship("ProdFormingTrolley", back_populates="batch", lazy="raise", cascade="all, delete-orphan")
    packing_records = relationship("ProdPackingRecord", back_populates="batch", lazy="raise", cascade="all, delete-orphan")
    packing_trims = relationship("ProdPackingTrim", back_populates="batch", lazy="raise", cascade="all, delete-orphan")
    cooking_logs = relationship("CookingLog", back_populates="prod_batch", lazy="raise", foreign_keys="CookingLog.prod_batch_id")
    hot_inputs = relationship("ProdHotInput", back_populates="batch", lazy="raise", cascade="all, delete-orphan", order_by="ProdHotInput.seq")


class ProdFormingTrolley(Base):
    __tablename__ = "prod_forming_trolleys"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("prod_batches.id", ondelete="CASCADE"), nullable=False)
    trolley_no = Column(VARCHAR(20), nullable=False)
    sampled_tray_count = Column(Integer, nullable=False)
    sampled_gross_weight_sum_kg = Column(Numeric(10, 3), nullable=False)
    tray_tare_weight_kg = Column(Numeric(8, 3), nullable=False)
    total_trays_on_trolley = Column(Integer, nullable=False)
    partial_trays_count = Column(Integer, nullable=False, server_default="0")
    partial_fill_ratio = Column(Numeric(4, 2), nullable=False, server_default="0.5")
    avg_tray_net_weight_kg = Column(Numeric(10, 4), nullable=True)
    equivalent_tray_count = Column(Numeric(10, 2), nullable=True)
    estimated_net_weight_kg = Column(Numeric(12, 3), nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    batch = relationship("ProdBatch", back_populates="forming_trolleys", lazy="raise")


class ProdPackingRecord(Base):
    __tablename__ = "prod_packing_records"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("prod_batches.id", ondelete="CASCADE"), nullable=False)
    pack_type = Column(VARCHAR(50), nullable=False)
    product_id = Column(Integer, ForeignKey("prod_products.id"), nullable=True)
    bag_count = Column(Integer, nullable=False)
    nominal_weight_kg = Column(Numeric(8, 3), nullable=False)
    theoretical_total_weight_kg = Column(Numeric(12, 3), nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    inv_item_id = Column(Integer, ForeignKey("inv_items.id", ondelete="SET NULL"), nullable=True)

    batch = relationship("ProdBatch", back_populates="packing_records", lazy="raise")
    product = relationship("ProdProduct", lazy="raise")
    inv_item = relationship("InvItem", lazy="raise")


class ProdPackingTrim(Base):
    __tablename__ = "prod_packing_trim"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("prod_batches.id", ondelete="CASCADE"), nullable=False)
    trim_type = Column(VARCHAR(100), nullable=False)
    weight_kg = Column(Numeric(10, 3), nullable=False)
    remark = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    batch = relationship("ProdBatch", back_populates="packing_trims", lazy="raise")


class ProdHotInput(Base):
    """A single input (投料) entry for a hot-process batch. Multiple per batch."""
    __tablename__ = "prod_hot_inputs"

    id = Column(Integer, primary_key=True, index=True)
    prod_batch_id = Column(Integer, ForeignKey("prod_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    seq = Column(Integer, nullable=False)  # 1, 2, 3 … per batch
    weight_kg = Column(Numeric(12, 3), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    batch = relationship("ProdBatch", back_populates="hot_inputs", lazy="raise")


class ProdRepackJob(Base):
    __tablename__ = "prod_repack_jobs"

    id = Column(Integer, primary_key=True, index=True)
    new_batch_code = Column(VARCHAR(50), nullable=False)
    date = Column(Date, nullable=False)
    operator = Column(VARCHAR(100), nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    inputs = relationship("ProdRepackInput", back_populates="repack_job", lazy="raise", cascade="all, delete-orphan")
    outputs = relationship("ProdRepackOutput", back_populates="repack_job", lazy="raise", cascade="all, delete-orphan")
    trims = relationship("ProdRepackTrim", back_populates="repack_job", lazy="raise", cascade="all, delete-orphan")


class ProdRepackInput(Base):
    __tablename__ = "prod_repack_inputs"

    id = Column(Integer, primary_key=True, index=True)
    repack_job_id = Column(Integer, ForeignKey("prod_repack_jobs.id", ondelete="CASCADE"), nullable=False)
    from_batch_id = Column(Integer, ForeignKey("prod_batches.id"), nullable=True)
    product_id = Column(Integer, ForeignKey("prod_products.id"), nullable=True)
    bag_count = Column(Integer, nullable=False)
    nominal_weight_kg = Column(Numeric(8, 3), nullable=False)
    total_weight_kg = Column(Numeric(12, 3), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    repack_job = relationship("ProdRepackJob", back_populates="inputs", lazy="raise")
    batch = relationship("ProdBatch", lazy="raise")
    product = relationship("ProdProduct", lazy="raise")


class ProdRepackOutput(Base):
    __tablename__ = "prod_repack_outputs"

    id = Column(Integer, primary_key=True, index=True)
    repack_job_id = Column(Integer, ForeignKey("prod_repack_jobs.id", ondelete="CASCADE"), nullable=False)
    pack_type = Column(VARCHAR(50), nullable=False)
    product_id = Column(Integer, ForeignKey("prod_products.id"), nullable=True)
    bag_count = Column(Integer, nullable=False)
    nominal_weight_kg = Column(Numeric(8, 3), nullable=False)
    total_weight_kg = Column(Numeric(12, 3), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    repack_job = relationship("ProdRepackJob", back_populates="outputs", lazy="raise")
    product = relationship("ProdProduct", lazy="raise")


class ProdRepackTrim(Base):
    __tablename__ = "prod_repack_trim"

    id = Column(Integer, primary_key=True, index=True)
    repack_job_id = Column(Integer, ForeignKey("prod_repack_jobs.id", ondelete="CASCADE"), nullable=False)
    trim_type = Column(VARCHAR(100), nullable=False)
    weight_kg = Column(Numeric(10, 3), nullable=False)
    remark = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    repack_job = relationship("ProdRepackJob", back_populates="trims", lazy="raise")
