"""Equipment model — cooking equipment referenced by cooking_logs."""

from sqlalchemy import Column, Integer, Boolean, VARCHAR
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.sql import func

from app.core.database import Base


class Equipment(Base):
    __tablename__ = "equipment"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(VARCHAR(100), unique=True, nullable=False)
    equipment_type = Column(VARCHAR(50), nullable=True)
    location = Column(VARCHAR(100), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
