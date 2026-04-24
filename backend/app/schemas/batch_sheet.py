"""Daily Batch Sheet schemas (FSP-LOG-017)."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, ConfigDict


class ReceivingLogSummary(BaseModel):
    """Minimal receiving log info embedded in batch sheet line responses."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    po_number: Optional[str] = None
    supplier_name: Optional[str] = None
    created_at: datetime


class ProdBatchSheetLineCreate(BaseModel):
    """Data for a single ingredient line (sent from frontend)."""
    inv_item_id: Optional[int] = None
    ingredient_name: str
    receiving_log_id: Optional[int] = None
    supplier: Optional[str] = None
    supplier_batch_no: Optional[str] = None
    qty_used: Optional[Decimal] = None
    unit: Optional[str] = None
    seq: int = 0


class ProdBatchSheetLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sheet_id: int
    inv_item_id: Optional[int] = None
    ingredient_name: str
    receiving_log_id: Optional[int] = None
    receiving_log: Optional[ReceivingLogSummary] = None
    supplier: Optional[str] = None
    supplier_batch_no: Optional[str] = None
    qty_used: Optional[Decimal] = None
    unit: Optional[str] = None
    seq: int


class SaveBatchSheetRequest(BaseModel):
    """Full batch sheet save (operator + all lines)."""
    operator_name: Optional[str] = None
    lines: List[ProdBatchSheetLineCreate]


class ProdDailyBatchSheetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: int
    operator_id: Optional[int] = None
    operator_name: Optional[str] = None
    verified_by: Optional[int] = None
    verifier_name: Optional[str] = None
    verified_at: Optional[datetime] = None
    is_locked: bool
    created_at: datetime
    lines: List[ProdBatchSheetLineResponse] = []


class BatchSheetSummaryResponse(BaseModel):
    """For the list page — one item per production batch."""
    batch_id: int
    batch_code: str
    product_name: str
    production_date: date
    sheet_id: Optional[int] = None
    has_sheet: bool
    is_locked: bool
    line_count: int
    operator_name: Optional[str] = None
    verified_by: Optional[int] = None
