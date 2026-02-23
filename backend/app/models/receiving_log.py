"""Receiving Log model (FSP-LOG-001)."""

from sqlalchemy import Column, Integer, Numeric, Text, ForeignKey, VARCHAR
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.enums import PassFailType, AcceptanceType
from app.models.base import ALCOAMixin


class ReceivingLog(ALCOAMixin, Base):
    __tablename__ = "receiving_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Business fields
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    po_number = Column(VARCHAR(50), nullable=True)
    product_name = Column(VARCHAR(200), nullable=False)
    temp_chilled = Column(Numeric(5, 2), nullable=True)
    temp_frozen = Column(Numeric(5, 2), nullable=True)
    vehicle_cleanliness = Column(PassFailType, nullable=False)
    packaging_integrity = Column(PassFailType, nullable=False)
    acceptance_status = Column(AcceptanceType, nullable=False, server_default="Accept")
    corrective_action = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    # Relationships
    supplier = relationship("Supplier", lazy="raise", foreign_keys=[supplier_id])
    operator = relationship("User", lazy="raise", foreign_keys="ReceivingLog.operator_id")
    verifier = relationship("User", lazy="raise", foreign_keys="ReceivingLog.verified_by")
