"""Equipment schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class EquipmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    equipment_type: Optional[str] = None
    location: Optional[str] = None
    is_active: bool
    created_at: datetime


class EquipmentCreate(BaseModel):
    name: str = Field(..., max_length=100)
    equipment_type: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=100)


class EquipmentUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    equipment_type: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=100)
    is_active: Optional[bool] = None
