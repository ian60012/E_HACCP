from sqlalchemy import Column, Integer, String, Float, Boolean
from sqlalchemy.orm import relationship

from app.core.database import Base


class Product(Base):
    """Product model"""
    __tablename__ = "products"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    ccp_limit_temp = Column(Float, default=90.0, nullable=False)
    is_active = Column(Boolean, default=True)
    
    # Relationships
    cooking_logs = relationship("CookingLog", back_populates="product")
