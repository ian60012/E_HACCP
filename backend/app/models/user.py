"""User model — production, warehouse, QA staff, and admins."""

from sqlalchemy import Column, Integer, Boolean, VARCHAR
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.enums import UserRoleType


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(VARCHAR(50), unique=True, nullable=False, index=True)
    password_hash = Column(VARCHAR(255), nullable=False)
    full_name = Column(VARCHAR(100), nullable=False, server_default="")
    email = Column(VARCHAR(255), nullable=True)
    role = Column(UserRoleType, nullable=False, server_default="Production")
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    # Note: updated_at is auto-managed by DB trigger trg_users_updated_at
