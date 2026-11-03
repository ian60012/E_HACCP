"""Per-batch sensory quality, retained-sample, and release records."""

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    VARCHAR,
)
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ProdBatchQualityInspection(Base):
    __tablename__ = "prod_batch_quality_inspections"
    __table_args__ = (
        UniqueConstraint("batch_id", "revision", name="uq_prod_batch_quality_revision"),
    )

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("prod_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    revision = Column(Integer, nullable=False, server_default="1")
    status = Column(VARCHAR(20), nullable=False, server_default="draft")

    inspection_at = Column(TIMESTAMP(timezone=True), nullable=True)
    color_result = Column(VARCHAR(20), nullable=True)
    aroma_result = Column(VARCHAR(20), nullable=True)
    taste_result = Column(VARCHAR(20), nullable=True)
    not_applicable_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    corrective_action = Column(Text, nullable=True)

    retained_sample = Column(Boolean, nullable=True)
    no_sample_reason = Column(Text, nullable=True)
    sample_code = Column(VARCHAR(100), nullable=True)
    sample_quantity = Column(Numeric(12, 3), nullable=True)
    sample_unit = Column(VARCHAR(30), nullable=True)
    sampled_at = Column(TIMESTAMP(timezone=True), nullable=True)
    storage_condition = Column(VARCHAR(20), nullable=True)
    storage_location = Column(VARCHAR(200), nullable=True)
    disposal_due_date = Column(Date, nullable=True)

    photo_stored_name = Column(VARCHAR(255), nullable=True)
    photo_original_name = Column(VARCHAR(255), nullable=True)
    photo_content_type = Column(VARCHAR(100), nullable=True)
    photo_size_bytes = Column(Integer, nullable=True)
    photo_uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    photo_uploaded_at = Column(TIMESTAMP(timezone=True), nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    verified_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    verified_at = Column(TIMESTAMP(timezone=True), nullable=True)
    verifier_signature_data_url = Column(Text, nullable=True)

    batch = relationship("ProdBatch", back_populates="quality_inspections", lazy="raise")
    creator = relationship("User", lazy="raise", foreign_keys=[created_by])
    updater = relationship("User", lazy="raise", foreign_keys=[updated_by])
    verifier = relationship("User", lazy="raise", foreign_keys=[verified_by])


class QualityRolePermission(Base):
    __tablename__ = "quality_role_permissions"

    role = Column(VARCHAR(30), primary_key=True)
    can_view = Column(Boolean, nullable=False, server_default="false")
    can_edit = Column(Boolean, nullable=False, server_default="false")
    can_verify = Column(Boolean, nullable=False, server_default="false")
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())


class QualityControlSetting(Base):
    __tablename__ = "quality_control_settings"

    id = Column(Integer, primary_key=True)
    enforcement_started_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
