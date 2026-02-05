from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class CookingLogCreate(BaseModel):
    """Schema for creating a cooking log"""
    batch_no: str = Field(..., description="Unique batch number")
    product_id: int = Field(..., description="Product ID")
    operator_id: int = Field(..., description="Operator user ID")
    start_time: datetime = Field(..., description="Cooking start time")
    end_time: datetime = Field(..., description="Cooking end time")
    core_temp: float = Field(..., description="Core temperature in Celsius", ge=0.0, le=200.0)


class CookingLogResponse(BaseModel):
    """Schema for cooking log response"""
    id: int
    batch_no: str
    product_id: int
    product_name: Optional[str] = None
    operator_id: int
    operator_username: Optional[str] = None
    start_time: datetime
    end_time: datetime
    core_temp: float
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class CookingLogStatus(BaseModel):
    """Schema for CCP validation status"""
    status: str
    message: str
    requires_deviation: bool
