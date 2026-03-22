"""Inventory module schemas (出入庫管理)."""

from datetime import datetime
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Item master (品項)
# ---------------------------------------------------------------------------

class InvItemCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    category: Optional[str] = Field(None, max_length=100)
    base_unit: str = Field(default="PCS", max_length=20)
    description: Optional[str] = None
    supplier_id: Optional[int] = None
    allowed_location_ids: Optional[List[int]] = None


class InvItemUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    category: Optional[str] = Field(None, max_length=100)
    base_unit: Optional[str] = Field(None, max_length=20)
    description: Optional[str] = None
    supplier_id: Optional[int] = None
    is_active: Optional[bool] = None
    allowed_location_ids: Optional[List[int]] = None


class InvItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    category: Optional[str] = None
    base_unit: str
    description: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    is_active: bool
    created_at: datetime
    allowed_location_ids: List[int] = []


class InvAllowedLocationsUpdate(BaseModel):
    location_ids: List[int]


# ---------------------------------------------------------------------------
# Location (儲位)
# ---------------------------------------------------------------------------

class InvLocationCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    zone: Optional[str] = Field(None, max_length=100)


class InvLocationUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    zone: Optional[str] = Field(None, max_length=100)
    is_active: Optional[bool] = None


class InvLocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    zone: Optional[str] = None
    is_active: bool


# ---------------------------------------------------------------------------
# Document lines (明細)
# ---------------------------------------------------------------------------

class InvStockLineCreate(BaseModel):
    item_id: int
    location_id: int
    quantity: Decimal = Field(..., gt=0)
    unit: str = Field(..., max_length=20)
    unit_cost: Optional[Decimal] = Field(None, ge=0)
    notes: Optional[str] = None


class InvStockLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doc_id: int
    item_id: int
    item_code: Optional[str] = None
    item_name: Optional[str] = None
    location_id: int
    location_name: Optional[str] = None
    quantity: Decimal
    unit: str
    unit_cost: Optional[Decimal] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Stock document (入出庫單)
# ---------------------------------------------------------------------------

class InvStockDocCreate(BaseModel):
    doc_type: str = Field(..., description="IN or OUT")
    location_id: Optional[int] = None
    ref_number: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    lines: List[InvStockLineCreate] = Field(..., min_length=1)


class InvStockDocVoidRequest(BaseModel):
    void_reason: str = Field(..., min_length=5, max_length=1000)


class InvStockDocResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doc_number: str
    doc_type: str
    status: str
    location_id: Optional[int] = None
    location_name: Optional[str] = None
    receiving_log_id: Optional[int] = None
    ref_number: Optional[str] = None
    notes: Optional[str] = None
    void_reason: Optional[str] = None
    operator_id: Optional[int] = None
    operator_name: Optional[str] = None
    created_at: datetime
    posted_at: Optional[datetime] = None
    voided_at: Optional[datetime] = None
    lines: List[InvStockLineResponse] = []


# ---------------------------------------------------------------------------
# Balance (庫存)
# ---------------------------------------------------------------------------

class InvStockBalanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_id: int
    item_code: Optional[str] = None
    item_name: Optional[str] = None
    item_category: Optional[str] = None
    base_unit: Optional[str] = None
    location_id: int
    location_code: Optional[str] = None
    location_name: Optional[str] = None
    quantity: Decimal


# ---------------------------------------------------------------------------
# Movement (異動紀錄)
# ---------------------------------------------------------------------------

class InvStockMovementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doc_id: int
    item_id: int
    item_name: Optional[str] = None
    location_id: int
    location_name: Optional[str] = None
    delta: Decimal
    balance_after: Decimal
    created_at: datetime


# ---------------------------------------------------------------------------
# Convert receiving log to stock-IN doc
# ---------------------------------------------------------------------------

class ConvertToStockInRequest(BaseModel):
    location_id: int
