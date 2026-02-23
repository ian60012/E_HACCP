"""Supplier model — referenced by receiving_logs."""

from sqlalchemy import Column, Integer, Boolean, Text, VARCHAR
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.sql import func

from app.core.database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(VARCHAR(200), unique=True, nullable=False)
    contact_name = Column(VARCHAR(100), nullable=True)
    phone = Column(VARCHAR(50), nullable=True)
    email = Column(VARCHAR(255), nullable=True)
    address = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
