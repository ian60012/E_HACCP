"""Inventory module schemas (出入庫管理)."""

from datetime import date, datetime
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
    usage_unit: Optional[str] = Field(None, max_length=20, description="Production recording unit for Batch Sheet; null = use base_unit")
    description: Optional[str] = None
    supplier_id: Optional[int] = None
    allowed_location_ids: Optional[List[int]] = None


class InvItemUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    category: Optional[str] = Field(None, max_length=100)
    base_unit: Optional[str] = Field(None, max_length=20)
    usage_unit: Optional[str] = Field(None, max_length=20)
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
    usage_unit: Optional[str] = None
    description: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    is_active: bool
    created_at: datetime
    allowed_location_ids: List[int] = []


class InvAllowedLocationsUpdate(BaseModel):
    location_ids: List[int]


class InvItemBulkUpdate(BaseModel):
    ids: List[int] = Field(..., min_length=1)
    category: Optional[str] = Field(None, max_length=100)
    base_unit: Optional[str] = Field(None, max_length=20)
    usage_unit: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None


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


class InvStockDocUpdate(BaseModel):
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


# ---------------------------------------------------------------------------
# Stocktake (盤點)
# ---------------------------------------------------------------------------

class InvStocktakeCreate(BaseModel):
    location_id: int
    count_date: date
    notes: Optional[str] = None


class InvStocktakeLineUpdate(BaseModel):
    physical_qty: Optional[Decimal] = None
    notes: Optional[str] = None


class InvStocktakeLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_id: int
    item_code: str
    item_name: str
    item_unit: str
    location_id: int
    system_qty: Decimal
    physical_qty: Optional[Decimal] = None
    variance: Optional[Decimal] = None
    notes: Optional[str] = None


class InvStocktakeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doc_number: str
    status: str
    location_id: int
    location_name: str
    count_date: date
    notes: Optional[str] = None
    operator_id: Optional[int] = None
    confirmed_at: Optional[datetime] = None
    adj_in_doc_id: Optional[int] = None
    adj_out_doc_id: Optional[int] = None
    created_at: datetime
    lines: List[InvStocktakeLineResponse] = []
