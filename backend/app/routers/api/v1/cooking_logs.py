from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from app.core.database import get_db
from app.models.cooking_log import CookingLog, LogStatus
from app.models.product import Product
from app.models.user import User
from app.schemas.cooking_log import CookingLogCreate, CookingLogResponse, CookingLogStatus
from app.services.ccp_validator import validate_cooking_ccp

router = APIRouter()


@router.post("/cooking-logs", response_model=CookingLogResponse, status_code=status.HTTP_201_CREATED)
async def create_cooking_log(
    log_data: CookingLogCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new cooking log entry.
    
    Validates the core temperature against the product's CCP limit (default 90°C).
    If the temperature is below the limit, status is set to FAIL and a deviation record should be created.
    """
    # Verify product exists
    product_result = await db.execute(select(Product).where(Product.id == log_data.product_id))
    product = product_result.scalar_one_or_none()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with ID {log_data.product_id} not found"
        )
    
    # Verify operator exists
    operator_result = await db.execute(select(User).where(User.id == log_data.operator_id))
    operator = operator_result.scalar_one_or_none()
    if not operator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {log_data.operator_id} not found"
        )
    
    # Validate CCP
    ccp_status = validate_cooking_ccp(log_data.core_temp, product.ccp_limit_temp)
    
    # Create cooking log
    cooking_log = CookingLog(
        batch_no=log_data.batch_no,
        product_id=log_data.product_id,
        operator_id=log_data.operator_id,
        start_time=log_data.start_time,
        end_time=log_data.end_time,
        core_temp=log_data.core_temp,
        status=LogStatus.PASS if ccp_status.status == "PASS" else LogStatus.FAIL
    )
    
    db.add(cooking_log)
    await db.commit()
    await db.refresh(cooking_log)
    
    # Build response
    response = CookingLogResponse(
        id=cooking_log.id,
        batch_no=cooking_log.batch_no,
        product_id=cooking_log.product_id,
        product_name=product.name,
        operator_id=cooking_log.operator_id,
        operator_username=operator.username,
        start_time=cooking_log.start_time,
        end_time=cooking_log.end_time,
        core_temp=cooking_log.core_temp,
        status=cooking_log.status.value,
        created_at=cooking_log.created_at
    )
    
    # If validation failed, include warning in response
    if ccp_status.requires_deviation:
        response.status = "FAIL"
        # Note: In a full implementation, this would trigger creation of a deviation record
    
    return response


@router.get("/cooking-logs", response_model=list[CookingLogResponse])
async def get_cooking_logs(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Get all cooking logs with pagination"""
    result = await db.execute(
        select(CookingLog)
        .order_by(CookingLog.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    logs = result.scalars().all()
    
    # Fetch related data
    responses = []
    for log in logs:
        product_result = await db.execute(select(Product).where(Product.id == log.product_id))
        product = product_result.scalar_one()
        
        operator_result = await db.execute(select(User).where(User.id == log.operator_id))
        operator = operator_result.scalar_one()
        
        responses.append(CookingLogResponse(
            id=log.id,
            batch_no=log.batch_no,
            product_id=log.product_id,
            product_name=product.name,
            operator_id=log.operator_id,
            operator_username=operator.username,
            start_time=log.start_time,
            end_time=log.end_time,
            core_temp=log.core_temp,
            status=log.status.value,
            created_at=log.created_at
        ))
    
    return responses


@router.get("/cooking-logs/{log_id}", response_model=CookingLogResponse)
async def get_cooking_log(
    log_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific cooking log by ID"""
    result = await db.execute(select(CookingLog).where(CookingLog.id == log_id))
    log = result.scalar_one_or_none()
    
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cooking log with ID {log_id} not found"
        )
    
    # Fetch related data
    product_result = await db.execute(select(Product).where(Product.id == log.product_id))
    product = product_result.scalar_one()
    
    operator_result = await db.execute(select(User).where(User.id == log.operator_id))
    operator = operator_result.scalar_one()
    
    return CookingLogResponse(
        id=log.id,
        batch_no=log.batch_no,
        product_id=log.product_id,
        product_name=product.name,
        operator_id=log.operator_id,
        operator_username=operator.username,
        start_time=log.start_time,
        end_time=log.end_time,
        core_temp=log.core_temp,
        status=log.status.value,
        created_at=log.created_at
    )
