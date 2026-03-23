"""Production module schemas (生產系統)."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Pack type config (包裝類型設定)
# ---------------------------------------------------------------------------

class ProdPackTypeConfigCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    applicable_type: str = "both"   # forming | hot_process | both
    nominal_weight_kg: Optional[Decimal] = None


class ProdPackTypeConfigUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    applicable_type: Optional[str] = None
    nominal_weight_kg: Optional[Decimal] = None
    is_active: Optional[bool] = None


class ProdPackTypeConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    applicable_type: str
    nominal_weight_kg: Optional[Decimal] = None
    is_active: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Product (產品)
# ---------------------------------------------------------------------------

class ProdProductCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    ccp_limit_temp: Decimal = Decimal("75.00")
    pack_size_kg: Optional[Decimal] = None
    loss_rate_warn_pct: Optional[Decimal] = None
    product_type: str = "forming"
    inv_item_id: Optional[int] = None


class ProdProductUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    ccp_limit_temp: Optional[Decimal] = None
    pack_size_kg: Optional[Decimal] = None
    loss_rate_warn_pct: Optional[Decimal] = None
    product_type: Optional[str] = None
    inv_item_id: Optional[int] = None
    is_active: Optional[bool] = None


class ProdProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    ccp_limit_temp: Decimal
    pack_size_kg: Optional[Decimal] = None
    loss_rate_warn_pct: Optional[Decimal] = None
    product_type: str = "forming"
    inv_item_id: Optional[int] = None
    is_active: bool
    created_at: datetime


class FormingOption(BaseModel):
    id: int
    code: str
    name: str
    product_type: str
    ccp_limit_temp: Optional[Decimal] = None
    pack_size_kg: Optional[Decimal] = None
    loss_rate_warn_pct: Optional[Decimal] = None


# ---------------------------------------------------------------------------
# Forming trolley (成型台車)
# ---------------------------------------------------------------------------

class ProdFormingTrolleyCreate(BaseModel):
    trolley_no: str = Field(..., max_length=20)
    sampled_tray_count: int
    sampled_gross_weight_sum_kg: Decimal
    tray_tare_weight_kg: Decimal
    total_trays_on_trolley: int
    partial_trays_count: int = 0
    partial_fill_ratio: Decimal = Decimal("0.5")
    remark: Optional[str] = None


class ProdFormingTrolleyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: int
    trolley_no: str
    sampled_tray_count: int
    sampled_gross_weight_sum_kg: Decimal
    tray_tare_weight_kg: Decimal
    total_trays_on_trolley: int
    partial_trays_count: int
    partial_fill_ratio: Decimal
    avg_tray_net_weight_kg: Optional[Decimal] = None
    equivalent_tray_count: Optional[Decimal] = None
    estimated_net_weight_kg: Optional[Decimal] = None
    remark: Optional[str] = None


# ---------------------------------------------------------------------------
# Packing record (包裝記錄)
# ---------------------------------------------------------------------------

class ProdPackingRecordCreate(BaseModel):
    pack_type: str = Field(..., max_length=20)
    product_id: Optional[int] = None
    inv_item_id: Optional[int] = None
    bag_count: int
    nominal_weight_kg: Decimal
    remark: Optional[str] = None


class ProdPackingRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: int
    pack_type: str
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    inv_item_id: Optional[int] = None
    inv_item_name: Optional[str] = None
    bag_count: int
    nominal_weight_kg: Decimal
    theoretical_total_weight_kg: Optional[Decimal] = None
    remark: Optional[str] = None


# ---------------------------------------------------------------------------
# Packing trim (包裝邊角料)
# ---------------------------------------------------------------------------

class ProdPackingTrimCreate(BaseModel):
    trim_type: str = Field(..., max_length=100)
    weight_kg: Decimal
    remark: Optional[str] = None


class ProdPackingTrimResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: int
    trim_type: str
    weight_kg: Decimal
    remark: Optional[str] = None


# ---------------------------------------------------------------------------
# Packing save (bulk save request)
# ---------------------------------------------------------------------------

class ProdPackingSaveRequest(BaseModel):
    records: List[ProdPackingRecordCreate]
    trims: List[ProdPackingTrimCreate]


# ---------------------------------------------------------------------------
# Batch (批次)
# ---------------------------------------------------------------------------

class ProdBatchCreate(BaseModel):
    product_code: str = Field(..., max_length=50)
    product_name: str = Field(..., max_length=200)
    production_date: date
    shift: Optional[str] = None
    spec_piece_weight_g: Decimal = Decimal("0")
    start_time: Optional[datetime] = None
    operator: Optional[str] = Field(None, max_length=100)
    supervisor: Optional[str] = Field(None, max_length=100)
    input_weight_kg: Optional[Decimal] = None


class ProdBatchUpdate(BaseModel):
    shift: Optional[str] = None
    spec_piece_weight_g: Optional[Decimal] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    operator: Optional[str] = Field(None, max_length=100)
    supervisor: Optional[str] = Field(None, max_length=100)
    input_weight_kg: Optional[Decimal] = None


class ProdHotInputCreate(BaseModel):
    weight_kg: Decimal = Field(..., gt=0)
    notes: Optional[str] = None


class ProdHotInputResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    prod_batch_id: int
    seq: int
    weight_kg: Decimal
    notes: Optional[str] = None
    created_at: datetime


class ProdBatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_code: str
    product_code: str
    product_name: str
    production_date: date
    shift: Optional[str] = None
    spec_piece_weight_g: Decimal
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: str
    operator: Optional[str] = None
    supervisor: Optional[str] = None
    estimated_forming_net_weight_kg: Optional[Decimal] = None
    estimated_forming_pieces: Optional[int] = None
    input_weight_kg: Optional[Decimal] = None
    inv_stock_doc_id: Optional[int] = None
    created_at: datetime
    trolleys: List[ProdFormingTrolleyResponse] = []
    packing_records: List[ProdPackingRecordResponse] = []
    packing_trims: List[ProdPackingTrimResponse] = []
    hot_inputs: List[ProdHotInputResponse] = []


class HotProcessBalanceResponse(BaseModel):
    input_weight_kg: Optional[Decimal] = None
    packed_weight_kg: Decimal
    loss_weight_kg: Optional[Decimal] = None
    loss_rate: Optional[Decimal] = None


class EnterStockRequest(BaseModel):
    location_id: int


# ---------------------------------------------------------------------------
# Repack input (改包投入)
# ---------------------------------------------------------------------------

class ProdRepackInputCreate(BaseModel):
    from_batch_id: Optional[int] = None
    product_id: Optional[int] = None
    bag_count: int
    nominal_weight_kg: Decimal


class ProdRepackInputResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    repack_job_id: int
    from_batch_id: Optional[int] = None
    from_batch_code: Optional[str] = None
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    bag_count: int
    nominal_weight_kg: Decimal
    total_weight_kg: Optional[Decimal] = None


# ---------------------------------------------------------------------------
# Repack output (改包產出)
# ---------------------------------------------------------------------------

class ProdRepackOutputCreate(BaseModel):
    pack_type: str = Field(..., max_length=20)
    product_id: Optional[int] = None
    bag_count: int
    nominal_weight_kg: Decimal


class ProdRepackOutputResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    repack_job_id: int
    pack_type: str
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    bag_count: int
    nominal_weight_kg: Decimal
    total_weight_kg: Optional[Decimal] = None


# ---------------------------------------------------------------------------
# Repack trim (改包邊角料)
# ---------------------------------------------------------------------------

class ProdRepackTrimCreate(BaseModel):
    trim_type: str = Field(..., max_length=100)
    weight_kg: Decimal
    remark: Optional[str] = None


class ProdRepackTrimResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    repack_job_id: int
    trim_type: str
    weight_kg: Decimal
    remark: Optional[str] = None


# ---------------------------------------------------------------------------
# Repack job (改包工單)
# ---------------------------------------------------------------------------

class ProdRepackJobCreate(BaseModel):
    date: date
    operator: Optional[str] = Field(None, max_length=100)
    remark: Optional[str] = None


class ProdRepackJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    new_batch_code: str
    date: date
    operator: Optional[str] = None
    remark: Optional[str] = None
    created_at: datetime
    inputs: List[ProdRepackInputResponse] = []
    outputs: List[ProdRepackOutputResponse] = []
    trims: List[ProdRepackTrimResponse] = []


# ---------------------------------------------------------------------------
# Calculation responses (計算結果)
# ---------------------------------------------------------------------------

class FormingTotalsResponse(BaseModel):
    total_net_weight_kg: Decimal
    total_pieces: int
    duration_minutes: Optional[float] = None
    pieces_per_hour: Optional[float] = None


class PackingTotalsResponse(BaseModel):
    forming_input_kg: Decimal
    total_packed_kg: Decimal
    total_trim_kg: Decimal
    output_total_kg: Decimal
    loss_kg: Decimal
    loss_rate: float
    by_pack_type: dict[str, Decimal] = {}


class RepackTotalsResponse(BaseModel):
    input_total_kg: Decimal
    output_total_kg: Decimal
    trim_total_kg: Decimal
    loss_kg: Decimal
    loss_rate: float
