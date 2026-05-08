"""LabelMaker schemas."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class NutritionValues(BaseModel):
    energyKj: float = 0
    proteinG: float = 0
    fatTotalG: float = 0
    fatSaturatedG: float = 0
    carbohydrateG: float = 0
    sugarsG: float = 0
    sodiumMg: float = 0


class LabelIngredient(BaseModel):
    id: str
    name: str
    allergenTags: list[str] = []
    sulphitesMgPerKg: Optional[float] = None


class LabelTemplateBase(BaseModel):
    prod_product_id: int
    pack_type_code: str = Field(..., max_length=50)
    product_name_zh: str = Field("", max_length=200)
    product_name_en: str = Field(..., max_length=200)
    net_weight_g: Decimal
    serving_size_g: Decimal
    servings_per_package: Decimal = Decimal("1")
    storage_conditions: str
    customer_text: str
    shelf_life_days: int = Field(365, ge=0, le=3650)
    nutrition_per_100g: NutritionValues
    ingredients: list[LabelIngredient]
    recipe: Optional[dict[str, Any]] = None
    allergens_confirmed_at: Optional[datetime] = None


class LabelTemplateCreate(LabelTemplateBase):
    pass


class LabelTemplateUpdate(BaseModel):
    product_name_zh: Optional[str] = Field(None, max_length=200)
    product_name_en: Optional[str] = Field(None, max_length=200)
    net_weight_g: Optional[Decimal] = None
    serving_size_g: Optional[Decimal] = None
    servings_per_package: Optional[Decimal] = None
    storage_conditions: Optional[str] = None
    customer_text: Optional[str] = None
    shelf_life_days: Optional[int] = Field(None, ge=0, le=3650)
    nutrition_per_100g: Optional[NutritionValues] = None
    ingredients: Optional[list[LabelIngredient]] = None
    recipe: Optional[dict[str, Any]] = None
    allergens_confirmed_at: Optional[datetime] = None


class LabelTemplateResponse(LabelTemplateBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    pack_type_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TranslateIngredientRequest(BaseModel):
    query: str = Field(..., max_length=120)


class IngredientTranslationResponse(BaseModel):
    englishTerms: list[str]
    displayHint: str
    confidence: float


class RefineIngredientItem(BaseModel):
    id: str
    fsanzName: str
    currentLabelName: str
    weightG: float
    percentage: float


class RefineIngredientLabelsRequest(BaseModel):
    productName: str = Field("", max_length=160)
    ingredients: list[RefineIngredientItem]


class RefinedIngredientLabel(BaseModel):
    id: str
    labelName: str
    showPercentage: bool


class IngredientLabelRefinementResponse(BaseModel):
    ingredients: list[RefinedIngredientLabel]
    note: str


class LabelPdfRequest(BaseModel):
    template_id: Optional[int] = None
    prod_product_id: Optional[int] = None
    pack_type_code: Optional[str] = None
    production_date: Optional[date] = None
    expiry_date: Optional[date] = None
