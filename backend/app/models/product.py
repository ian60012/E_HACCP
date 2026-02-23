"""Product model — food products with configurable CCP temperature limits."""

from sqlalchemy import Column, Integer, Boolean, Numeric, VARCHAR
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.sql import func

from app.core.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(VARCHAR(200), nullable=False)
    ccp_limit_temp = Column(Numeric(5, 2), nullable=False, server_default="75.00")
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
