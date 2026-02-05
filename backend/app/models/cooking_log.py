from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.core.database import Base


class LogStatus(str, enum.Enum):
    """Log status enumeration"""
    PASS = "PASS"
    FAIL = "FAIL"


class CookingLog(Base):
    """Cooking log model"""
    __tablename__ = "cooking_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    batch_no = Column(String, unique=True, nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    core_temp = Column(Float, nullable=False)
    status = Column(Enum(LogStatus), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    product = relationship("Product", back_populates="cooking_logs")
    operator = relationship("User", back_populates="cooking_logs")
