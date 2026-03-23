"""Users router — CRUD for user management (Admin-only)."""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.user import User
from app.schemas.user import UserResponse, UserCreate, UserUpdate, PasswordReset
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user, require_role

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=PaginatedResponse[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    """List all users (Admin only)."""
    total_result = await db.execute(select(func.count(User.id)))
    total = total_result.scalar()

    result = await db.execute(
        select(User).order_by(User.id).offset(skip).limit(limit)
    )
    users = result.scalars().all()

    items = [
        UserResponse(
            id=u.id,
            username=u.username,
            full_name=u.full_name,
            email=u.email,
            role=u.role.value if hasattr(u.role, "value") else str(u.role),
            is_active=u.is_active,
            created_at=u.created_at,
        )
        for u in users
    ]
    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single user by ID (Admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    current_user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user (Admin only)."""
    # Check uniqueness
    existing = await db.execute(select(User).where(User.username == data.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(
        username=data.username,
        password_hash=get_password_hash(data.password),
        full_name=data.full_name,
        email=data.email,
        role=data.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    data: UserUpdate,
    current_user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    """Update user fields (Admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    data: PasswordReset,
    current_user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    """Reset a user's password (Admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = get_password_hash(data.new_password)
    await db.commit()

    return {"detail": "Password reset successfully"}
