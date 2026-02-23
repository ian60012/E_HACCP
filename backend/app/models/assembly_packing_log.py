"""Assembly & Packing Log model (FSP-LOG-ASM-001)."""

from sqlalchemy import Column, Integer, Boolean, Numeric, Text, ForeignKey, VARCHAR, Computed
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.enums import PassFailType
from app.models.base import ALCOAMixin


class AssemblyPackingLog(ALCOAMixin, Base):
    __tablename__ = "assembly_packing_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Business fields
    batch_id = Column(VARCHAR(50), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)

    # Label verification
    is_allergen_declared = Column(Boolean, nullable=False)
    is_date_code_correct = Column(Boolean, nullable=True)
    label_photo_path = Column(VARCHAR(500), nullable=True)

    # Weight check (5 samples)
    target_weight_g = Column(Numeric(8, 2), nullable=True)
    sample_1_g = Column(Numeric(8, 2), nullable=True)
    sample_2_g = Column(Numeric(8, 2), nullable=True)
    sample_3_g = Column(Numeric(8, 2), nullable=True)
    sample_4_g = Column(Numeric(8, 2), nullable=True)
    sample_5_g = Column(Numeric(8, 2), nullable=True)

    # Generated average weight (STORED — auto-computed when all 5 samples present)
    average_weight_g = Column(
        Numeric(8, 2),
        Computed(
            "CASE WHEN sample_1_g IS NOT NULL AND sample_2_g IS NOT NULL "
            "AND sample_3_g IS NOT NULL AND sample_4_g IS NOT NULL "
            "AND sample_5_g IS NOT NULL "
            "THEN (sample_1_g + sample_2_g + sample_3_g + sample_4_g + sample_5_g) / 5.0 "
            "ELSE NULL END",
            persisted=True,
        ),
    )

    # Packaging integrity
    seal_integrity = Column(PassFailType, nullable=True)
    coding_legibility = Column(PassFailType, nullable=True)
    corrective_action = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    # Relationships
    product = relationship("Product", lazy="raise", foreign_keys=[product_id])
    operator = relationship("User", lazy="raise", foreign_keys="AssemblyPackingLog.operator_id")
    verifier = relationship("User", lazy="raise", foreign_keys="AssemblyPackingLog.verified_by")
