from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime, model_validator
from app.schemas.common import SignatureDataUrl

Weight = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3)]
Name = Annotated[str, Field(min_length=1, max_length=200)]


class Detail(BaseModel):
    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True, extra="forbid")


class MeatInputData(Detail):
    inv_item_id: int = Field(gt=0)
    supplier: str = Field(default="", max_length=200)
    source_batch: str = Field(default="", max_length=100)
    receiving_log_id: int | None = Field(None, gt=0)
    weight_kg: Weight
    source_location_id: int | None = Field(None, gt=0)
    source_lot_id: int | None = Field(None, gt=0)


class MeatStepData(Detail):
    kind: Literal["thaw", "trim", "slice", "dice", "mince", "marinate"]
    start_time: AwareDatetime | None = None
    end_time: AwareDatetime | None = None
    operator: str = Field(min_length=1, max_length=100)
    temperature_c: Annotated[Decimal, Field(max_digits=5, decimal_places=2)] | None = None
    measured_at: AwareDatetime | None = None
    notes: str = ""

    @model_validator(mode="after")
    def check_times(self):
        if self.end_time and (not self.start_time or self.end_time < self.start_time):
            raise ValueError("結束時間不得早於開始時間 End must follow start")
        if (self.temperature_c is None) != (self.measured_at is None):
            raise ValueError("溫度與量測時間須一起填寫 Temperature requires measurement time")
        return self


class MeatOutputData(Detail):
    inv_item_id: int = Field(gt=0)
    weight_kg: Weight
    pack_count: int | None = Field(None, gt=0)
    pack_type: str | None = Field(None, max_length=50)
    location_id: int = Field(gt=0)


class MeatLossData(Detail):
    kind: str = Field(min_length=1, max_length=100)
    weight_kg: Weight
    notes: str = ""


class MeatSave(Detail):
    version: int = Field(ge=0)
    inputs: list[MeatInputData] = Field(default_factory=list, max_length=500)
    steps: list[MeatStepData] = Field(default_factory=list, max_length=500)
    outputs: list[MeatOutputData] = Field(default_factory=list, max_length=500)
    losses: list[MeatLossData] = Field(default_factory=list, max_length=500)
    difference_reason: str = ""


class MeatVersion(Detail):
    version: int = Field(gt=0)


class MeatComplete(MeatVersion):
    operator_signature_data_url: SignatureDataUrl


class MeatVerify(MeatVersion):
    verifier_signature_data_url: SignatureDataUrl


class MeatInputRead(MeatInputData):
    item_name: str
    source_location_name: str | None = None
    source_lot_code: str | None = None


class MeatOutputRead(MeatOutputData):
    item_name: str
    location_name: str


class MeatTotals(BaseModel):
    input_kg: Decimal
    output_kg: Decimal
    loss_kg: Decimal
    difference_kg: Decimal
    yield_pct: Decimal | None


class MeatRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    batch_id: int
    version: int
    state: Literal["draft", "submitted", "verified", "stocked"]
    difference_reason: str
    created_by: int
    created_at: datetime
    completed_by: int | None
    completed_at: datetime | None
    operator_signature_data_url: str | None
    verified_by: int | None
    verified_at: datetime | None
    verifier_signature_data_url: str | None
    inputs: list[MeatInputRead]
    steps: list[MeatStepData]
    outputs: list[MeatOutputRead]
    losses: list[MeatLossData]
    totals: MeatTotals
