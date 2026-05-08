"""LabelMaker integration router."""

import html
import json
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.dependencies.auth import get_current_active_user, require_role
from app.models.labelmaker import LabelTemplate
from app.models.production import ProdPackTypeConfig, ProdProduct
from app.models.user import User
from app.schemas.labelmaker import (
    IngredientLabelRefinementResponse,
    IngredientTranslationResponse,
    LabelPdfRequest,
    LabelTemplateCreate,
    LabelTemplateResponse,
    LabelTemplateUpdate,
    RefineIngredientLabelsRequest,
    TranslateIngredientRequest,
)

router = APIRouter(prefix="/labelmaker", tags=["LabelMaker"])

PACK_SPECIFIC_TEMPLATE_FIELDS = {"net_weight_g", "serving_size_g", "servings_per_package"}


def _json(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


async def _to_response(db: AsyncSession, template: Any) -> LabelTemplateResponse:
    product = getattr(template, "product", None)
    pack_type_result = await db.execute(
        select(ProdPackTypeConfig).where(ProdPackTypeConfig.code == template.pack_type_code)
    )
    pack_type = pack_type_result.scalar_one_or_none()
    return LabelTemplateResponse(
        id=template.id,
        prod_product_id=template.prod_product_id,
        pack_type_code=template.pack_type_code,
        product_name_zh=template.product_name_zh,
        product_name_en=template.product_name_en,
        net_weight_g=template.net_weight_g,
        serving_size_g=template.serving_size_g,
        servings_per_package=template.servings_per_package,
        storage_conditions=template.storage_conditions,
        customer_text=template.customer_text,
        shelf_life_days=template.shelf_life_days,
        nutrition_per_100g=template.nutrition_per_100g,
        ingredients=template.ingredients,
        recipe=template.recipe,
        allergens_confirmed_at=template.allergens_confirmed_at,
        product_code=product.code if product else None,
        product_name=product.name if product else None,
        pack_type_name=pack_type.name if pack_type else None,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


async def _get_template(db: AsyncSession, template_id: int) -> LabelTemplate:
    result = await db.execute(
        select(LabelTemplate)
        .options(selectinload(LabelTemplate.product))
        .where(LabelTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label template not found")
    return template


async def _get_pack_type(db: AsyncSession, pack_type_code: str) -> ProdPackTypeConfig | None:
    result = await db.execute(
        select(ProdPackTypeConfig).where(ProdPackTypeConfig.code == pack_type_code)
    )
    return result.scalar_one_or_none()


def _pack_weight_g(product: ProdProduct | None, pack_type: ProdPackTypeConfig | None) -> Decimal | None:
    source = pack_type.nominal_weight_kg if pack_type and pack_type.nominal_weight_kg is not None else None
    if source is None and product and product.pack_size_kg is not None:
        source = product.pack_size_kg
    if source is None:
        return None
    return Decimal(str(source)) * Decimal("1000")


def _template_for_pack(
    template: LabelTemplate,
    pack_type_code: str,
    pack_type: ProdPackTypeConfig | None,
) -> Any:
    product = getattr(template, "product", None)
    pack_weight_g = _pack_weight_g(product, pack_type)
    if pack_weight_g is None:
        return template
    return SimpleNamespace(
        id=template.id,
        prod_product_id=template.prod_product_id,
        pack_type_code=pack_type_code,
        product_name_zh=template.product_name_zh,
        product_name_en=template.product_name_en,
        net_weight_g=pack_weight_g,
        serving_size_g=pack_weight_g,
        servings_per_package=template.servings_per_package,
        storage_conditions=template.storage_conditions,
        customer_text=template.customer_text,
        shelf_life_days=template.shelf_life_days,
        nutrition_per_100g=template.nutrition_per_100g,
        ingredients=template.ingredients,
        recipe=template.recipe,
        allergens_confirmed_at=template.allergens_confirmed_at,
        created_at=template.created_at,
        updated_at=template.updated_at,
        product=product,
    )


@router.get("/templates", response_model=list[LabelTemplateResponse])
async def list_templates(
    prod_product_id: Optional[int] = None,
    pack_type_code: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(LabelTemplate).options(selectinload(LabelTemplate.product)).order_by(LabelTemplate.updated_at.desc())
    if prod_product_id is not None:
        q = q.where(LabelTemplate.prod_product_id == prod_product_id)
    if pack_type_code:
        q = q.where(LabelTemplate.pack_type_code == pack_type_code)
    result = await db.execute(q)
    return [await _to_response(db, item) for item in result.scalars().all()]


@router.get("/templates/by-product-pack", response_model=LabelTemplateResponse)
async def get_template_by_product_pack(
    prod_product_id: int = Query(...),
    pack_type_code: str = Query(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    pack_type = await _get_pack_type(db, pack_type_code)
    result = await db.execute(
        select(LabelTemplate)
        .options(selectinload(LabelTemplate.product))
        .where(LabelTemplate.prod_product_id == prod_product_id)
        .where(LabelTemplate.pack_type_code == pack_type_code)
    )
    template = result.scalar_one_or_none()
    if not template:
        result = await db.execute(
            select(LabelTemplate)
            .options(selectinload(LabelTemplate.product))
            .where(LabelTemplate.prod_product_id == prod_product_id)
            .order_by(LabelTemplate.updated_at.desc())
            .limit(1)
        )
        template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label template not found")
    return await _to_response(db, _template_for_pack(template, pack_type_code, pack_type))


@router.get("/templates/{template_id}", response_model=LabelTemplateResponse)
async def get_template(
    template_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await _to_response(db, await _get_template(db, template_id))


@router.post("/templates", response_model=LabelTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    data: LabelTemplateCreate,
    current_user: User = Depends(require_role("Admin", "Production", "Captain")),
    db: AsyncSession = Depends(get_db),
):
    product = await db.get(ProdProduct, data.prod_product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Production product not found")

    template = LabelTemplate(
        **data.model_dump(
            mode="json",
            exclude={"nutrition_per_100g", "ingredients", "recipe", "allergens_confirmed_at"},
        ),
        nutrition_per_100g=data.nutrition_per_100g.model_dump(mode="json"),
        ingredients=[item.model_dump(mode="json") for item in data.ingredients],
        recipe=data.recipe,
        allergens_confirmed_at=data.allergens_confirmed_at,
    )
    db.add(template)
    try:
        await db.flush()
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A label template already exists for this product and pack type",
        ) from exc
    return await _to_response(db, await _get_template(db, template.id))


@router.patch("/templates/{template_id}", response_model=LabelTemplateResponse)
async def update_template(
    template_id: int,
    data: LabelTemplateUpdate,
    current_user: User = Depends(require_role("Admin", "Production", "Captain")),
    db: AsyncSession = Depends(get_db),
):
    template = await _get_template(db, template_id)
    updates: dict[str, Any] = {}
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "nutrition_per_100g" and value is not None:
            updates[field] = _json(value)
        elif field == "ingredients" and value is not None:
            updates[field] = [_json(item) for item in value]
        else:
            updates[field] = value
        setattr(template, field, updates[field])
    shared_updates = {
        field: value
        for field, value in updates.items()
        if field not in PACK_SPECIFIC_TEMPLATE_FIELDS
    }
    if shared_updates:
        result = await db.execute(
            select(LabelTemplate)
            .where(LabelTemplate.prod_product_id == template.prod_product_id)
            .where(LabelTemplate.id != template.id)
        )
        for sibling in result.scalars().all():
            for field, value in shared_updates.items():
                setattr(sibling, field, value)
    await db.flush()
    await db.commit()
    return await _to_response(db, await _get_template(db, template_id))


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: int,
    current_user: User = Depends(require_role("Admin", "Production", "Captain")),
    db: AsyncSession = Depends(get_db),
):
    template = await _get_template(db, template_id)
    await db.delete(template)
    await db.commit()


@router.post("/translate-ingredient-query", response_model=IngredientTranslationResponse)
async def translate_ingredient_query(
    data: TranslateIngredientRequest,
    current_user: User = Depends(get_current_active_user),
):
    _require_openai()
    result = await _openai_json(
        instructions=(
            "Translate short Chinese food ingredient search queries into concise English FSANZ food "
            "database search terms. Return only JSON with keys englishTerms, displayHint, confidence. "
            "englishTerms must be 1 to 5 common English ingredient terms."
        ),
        payload=f"Chinese ingredient query: {data.query.strip()}",
    )
    terms = result.get("englishTerms") if isinstance(result, dict) else []
    return IngredientTranslationResponse(
        englishTerms=[str(item).strip() for item in terms if str(item).strip()][:5],
        displayHint=str(result.get("displayHint") or "").strip() if isinstance(result, dict) else "",
        confidence=float(result.get("confidence") or 0) if isinstance(result, dict) else 0,
    )


@router.post("/refine-ingredient-labels", response_model=IngredientLabelRefinementResponse)
async def refine_ingredient_labels(
    data: RefineIngredientLabelsRequest,
    current_user: User = Depends(get_current_active_user),
):
    _require_openai()
    result = await _openai_json(
        instructions=(
            "You prepare Australian food label ingredient lists. Convert FSANZ database food names into "
            "concise consumer-facing ingredient names. Mark showPercentage true only for main or "
            "characterising ingredients. Return only JSON: {\"ingredients\":[{\"id\":string,"
            "\"labelName\":string,\"showPercentage\":boolean}],\"note\":string}."
        ),
        payload=data.model_dump(mode="json"),
    )
    return IngredientLabelRefinementResponse.model_validate(result)


@router.post("/render-pdf")
async def render_pdf(
    data: LabelPdfRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    template = await _resolve_pdf_template(db, data)
    expiry_date = data.expiry_date
    if not expiry_date:
        if not data.production_date:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="production_date is required")
        expiry_date = data.production_date + timedelta(days=template.shelf_life_days)

    pdf = await _render_label_pdf(_build_label_html(template, expiry_date.isoformat()))
    filename = _safe_filename(f"{template.product_name_en}-{expiry_date.isoformat()}.pdf")
    return StreamingResponse(
        iter([pdf]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


async def _resolve_pdf_template(db: AsyncSession, data: LabelPdfRequest) -> LabelTemplate:
    if data.template_id is not None:
        return await _get_template(db, data.template_id)
    if data.prod_product_id is None or not data.pack_type_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="template_id or prod_product_id + pack_type_code is required",
        )
    pack_type = await _get_pack_type(db, data.pack_type_code)
    result = await db.execute(
        select(LabelTemplate)
        .options(selectinload(LabelTemplate.product))
        .where(LabelTemplate.prod_product_id == data.prod_product_id)
        .where(LabelTemplate.pack_type_code == data.pack_type_code)
    )
    template = result.scalar_one_or_none()
    if not template:
        result = await db.execute(
            select(LabelTemplate)
            .options(selectinload(LabelTemplate.product))
            .where(LabelTemplate.prod_product_id == data.prod_product_id)
            .order_by(LabelTemplate.updated_at.desc())
            .limit(1)
        )
        template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label template not found")
    return _template_for_pack(template, data.pack_type_code, pack_type)


async def _openai_json(instructions: str, payload: Any) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.OPENAI_MODEL,
                "instructions": instructions,
                "input": json.dumps(payload, ensure_ascii=False) if not isinstance(payload, str) else payload,
            },
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=response.text)
    return json.loads(_strip_json_fence(_extract_response_text(response.json())))


def _require_openai() -> None:
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OPENAI_API_KEY is not configured")


def _extract_response_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    for item in payload.get("output", []) if isinstance(payload.get("output"), list) else []:
        for part in item.get("content", []) if isinstance(item.get("content"), list) else []:
            if isinstance(part.get("text"), str):
                return part["text"]
    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OpenAI response did not contain text")


def _strip_json_fence(value: str) -> str:
    text_value = value.strip()
    if text_value.startswith("```"):
        text_value = text_value.split("\n", 1)[1] if "\n" in text_value else text_value
        if text_value.endswith("```"):
            text_value = text_value[:-3]
    return text_value.strip()


async def _render_label_pdf(label_html: str) -> bytes:
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PDF renderer is not installed. Install Playwright Chromium in the backend image.",
        ) from exc

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            page = await browser.new_page()
            await page.set_content(label_html, wait_until="load")
            return await page.pdf(
                print_background=True,
                prefer_css_page_size=True,
                landscape=True,
                width="150mm",
                height="100mm",
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
        finally:
            await browser.close()


def _num(value: Any) -> float:
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _nutrition(template: LabelTemplate) -> dict[str, float]:
    values = template.nutrition_per_100g or {}
    return {
        "energyKj": _num(values.get("energyKj")),
        "proteinG": _num(values.get("proteinG")),
        "fatTotalG": _num(values.get("fatTotalG")),
        "fatSaturatedG": _num(values.get("fatSaturatedG")),
        "carbohydrateG": _num(values.get("carbohydrateG")),
        "sugarsG": _num(values.get("sugarsG")),
        "sodiumMg": _num(values.get("sodiumMg")),
    }


def _build_label_html(template: LabelTemplate, expiry_date: str) -> str:
    nutrition = _nutrition(template)
    serving_factor = _num(template.serving_size_g) / 100
    rows = [
        ("Energy", _format_energy(nutrition["energyKj"] * serving_factor), _format_energy(nutrition["energyKj"])),
        ("Protein", _format_grams(nutrition["proteinG"] * serving_factor), _format_grams(nutrition["proteinG"])),
        ("Fat, total", _format_grams(nutrition["fatTotalG"] * serving_factor), _format_grams(nutrition["fatTotalG"])),
        ("- saturated", _format_grams(nutrition["fatSaturatedG"] * serving_factor), _format_grams(nutrition["fatSaturatedG"])),
        ("Carbohydrate", _format_grams(nutrition["carbohydrateG"] * serving_factor), _format_grams(nutrition["carbohydrateG"])),
        ("- sugars", _format_grams(nutrition["sugarsG"] * serving_factor), _format_grams(nutrition["sugarsG"])),
        ("Sodium", _format_mg(nutrition["sodiumMg"] * serving_factor), _format_mg(nutrition["sodiumMg"])),
    ]
    ingredients = template.ingredients or []
    ingredient_text = ", ".join(str(item.get("name", "")).strip() for item in ingredients if str(item.get("name", "")).strip())
    contains = _format_contains(ingredients)
    factory = html.escape(template.customer_text or "").replace("\n", "<br />")
    rows_html = "".join(
        f"<tr><td>{html.escape(name)}</td><td>{html.escape(per_serving)}</td><td>{html.escape(per_100g)}</td></tr>"
        for name, per_serving, per_100g in rows
    )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page {{ size: 150mm 100mm; margin: 0; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; width: 150mm; height: 100mm; font-family: Arial, "Microsoft YaHei", sans-serif; color: #111; background: #fff; }}
    .label {{ width: 150mm; height: 100mm; padding: 4mm 5mm 3mm; display: grid; grid-template-columns: 90mm 42mm; grid-template-rows: auto 1fr auto; gap: 2.5mm 4mm; }}
    .title {{ grid-column: 1 / 3; border-bottom: 0.45mm solid #111; padding-bottom: 1.5mm; }}
    .zh {{ font-size: 17pt; font-weight: 700; line-height: 1.05; }}
    .en {{ font-size: 11pt; font-weight: 700; margin-top: 1mm; }}
    .net {{ font-size: 11pt; font-weight: 700; margin-top: 1.2mm; }}
    .section-title {{ font-size: 8pt; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm; }}
    .copy {{ font-size: 7.5pt; line-height: 1.25; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 6.1pt; }}
    th, td {{ border: 0.25mm solid #111; padding: 0.45mm 0.65mm; vertical-align: top; }}
    th {{ font-weight: 700; text-align: left; }}
    td:nth-child(2), td:nth-child(3), th:nth-child(2), th:nth-child(3) {{ text-align: right; }}
    .contains {{ margin-top: 1.5mm; font-size: 8pt; font-weight: 700; }}
    .footer {{ grid-column: 1 / 3; border-top: 0.35mm solid #111; padding-top: 1.3mm; display: grid; grid-template-columns: 1fr auto; gap: 4mm; align-items: end; }}
    .expiry {{ font-size: 11pt; font-weight: 700; text-align: right; }}
    .brand {{ font-size: 7.2pt; font-weight: 700; line-height: 1.18; }}
    .haccp {{ display: inline-block; margin-top: 0.8mm; border: 0.25mm solid #111; padding: 0.35mm 1.1mm; font-size: 7pt; font-weight: 700; }}
  </style>
</head>
<body>
  <main class="label">
    <section class="title">
      <div class="zh">{html.escape(template.product_name_zh)}</div>
      <div class="en">{html.escape(template.product_name_en)}</div>
      <div class="net">NET WT {round(_num(template.net_weight_g))}G</div>
    </section>
    <section>
      <div class="section-title">Ingredients</div>
      <div class="copy">{html.escape(ingredient_text)}</div>
      <div class="contains">{html.escape(contains)}</div>
      <div style="height: 4mm"></div>
      <div class="section-title">Storage Conditions</div>
      <div class="copy">{html.escape(template.storage_conditions)}</div>
    </section>
    <section>
      <div class="section-title">Nutritional Information</div>
      <table>
        <thead><tr><th></th><th>Avg. Quantity<br />Per Serving</th><th>Avg. Quantity<br />Per 100g</th></tr></thead>
        <tbody>
          <tr><td colspan="3">Serving size: {round(_num(template.serving_size_g))}g &nbsp; Servings per package: {_trim(_num(template.servings_per_package), 1)}</td></tr>
          {rows_html}
        </tbody>
      </table>
    </section>
    <section class="footer">
      <div class="brand">{factory}<br /><span class="haccp">HACCP Certified</span></div>
      <div class="expiry">EXPIRY DATE<br />{html.escape(_format_date(expiry_date))}</div>
    </section>
  </main>
</body>
</html>"""


def _format_contains(ingredients: list[dict[str, Any]]) -> str:
    labels = {
        "wheat": "Wheat",
        "barley": "Barley",
        "oats": "Oats",
        "rye": "Rye",
        "fish": "Fish",
        "crustacean": "Crustacean",
        "mollusc": "Mollusc",
        "egg": "Egg",
        "milk": "Milk",
        "lupin": "Lupin",
        "peanut": "Peanut",
        "soy": "Soy",
        "sesame": "Sesame",
        "almond": "Almond",
        "brazilNut": "Brazil nut",
        "cashew": "Cashew",
        "hazelnut": "Hazelnut",
        "macadamia": "Macadamia",
        "pecan": "Pecan",
        "pineNut": "Pine nut",
        "pistachio": "Pistachio",
        "walnut": "Walnut",
        "sulphites": "Sulphites",
    }
    seen: list[str] = []
    for ingredient in ingredients:
        for tag in ingredient.get("allergenTags", []) or []:
            if tag in labels and tag not in seen:
                seen.append(tag)
    return f"Contains: {', '.join(labels[tag] for tag in seen)}" if seen else "Contains: None declared"


def _format_energy(value: float) -> str:
    return f"{round(value)}kJ"


def _format_grams(value: float) -> str:
    return f"{_trim(value, 1)}g"


def _format_mg(value: float) -> str:
    return f"{round(value)}mg"


def _trim(value: float, decimals: int) -> str:
    text_value = f"{value:.{decimals}f}"
    return text_value.rstrip("0").rstrip(".")


def _format_date(value: str) -> str:
    parts = value.split("-")
    return f"{parts[2]}/{parts[1]}/{parts[0]}" if len(parts) == 3 else value


def _safe_filename(value: str) -> str:
    cleaned = "".join(
        ch if ch.isascii() and (ch.isalnum() or ch in "._-") else "-"
        for ch in value
    ).strip("-")
    return cleaned[:120] or "label.pdf"
