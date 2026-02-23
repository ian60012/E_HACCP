"""Product schemas."""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    ccp_limit_temp: Decimal
    is_active: bool
    created_at: datetime


class ProductCreate(BaseModel):
    name: str = Field(..., max_length=200)
    ccp_limit_temp: Decimal = Field(default=Decimal("75.00"), ge=0, le=250)


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    ccp_limit_temp: Optional[Decimal] = Field(None, ge=0, le=250)
    is_active: Optional[bool] = None
