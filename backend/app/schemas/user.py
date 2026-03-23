"""User schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    email: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., max_length=100)
    email: Optional[str] = None
    role: str = Field(default="Production", description="Admin, QA, Production, or Warehouse")


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class PasswordReset(BaseModel):
    """Admin resets another user's password."""
    new_password: str = Field(..., min_length=8, max_length=128)
