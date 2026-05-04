"""
Production Helper module — Captain-only.

週生產計畫 / 配方庫 / 叫貨總覽 (production planning, recipes, purchase requirements).

Migrated from the standalone `production_helper` project. Differences from the
original standalone version:

  * Authentication: every endpoint requires the "Captain" role.
  * Data source: products / recent batches / inventory items now come from
    E_HACCP's PostgreSQL (prod_products, prod_batches, inv_items) — the legacy
    external eQMS HTTP integration and JSON cache files have been removed.
  * Plans / recipes / purchase status remain file-based JSON for v1, stored
    under PRODUCTION_HELPER_DATA_DIR. May be migrated to Postgres later.
"""

from __future__ import annotations

import csv
import io
import json
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.dependencies.auth import require_role
from app.models.inventory import InvItem
from app.models.production import ProdBatch, ProdProduct
from app.models.user import User


# ---------------------------------------------------------------------------
# Data directory & JSON helpers
# ---------------------------------------------------------------------------

DATA_DIR = Path(getattr(settings, "PRODUCTION_HELPER_DATA_DIR", "/app/app/data/production_helper"))

JSON_DEFAULTS: dict[str, Any] = {
    "plans.json": {"items": []},
    "recipes.json": {"recipes": []},
    "purchase_status.json": {"ordered_keys": []},
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def init_data_dir() -> None:
    """Create the data directory and seed the three JSON files if absent."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for filename, default in JSON_DEFAULTS.items():
        path = DATA_DIR / filename
        if not path.exists():
            write_json(filename, default)


def read_json(filename: str) -> Any:
    path = DATA_DIR / filename
    if not path.exists():
        return JSON_DEFAULTS.get(filename, {})
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(filename: str, data: Any) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / filename
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    tmp.replace(path)


# ---------------------------------------------------------------------------
# DB-backed bootstrap data (replaces the old eQMS sync)
# ---------------------------------------------------------------------------

async def fetch_products(db: AsyncSession) -> dict[str, Any]:
    rows = (await db.execute(
        select(ProdProduct).where(ProdProduct.is_active.is_(True)).order_by(ProdProduct.code)
    )).scalars().all()
    items = [
        {
            "id": r.id,
            "code": r.code,
            "name": r.name,
            "product_type": (r.product_type.value if hasattr(r.product_type, "value") else r.product_type) if r.product_type is not None else None,
            "ccp_limit_temp": float(r.ccp_limit_temp) if r.ccp_limit_temp is not None else None,
            "is_active": r.is_active,
        }
        for r in rows
    ]
    return {"items": items, "total": len(items), "synced_at": utc_now()}


async def fetch_recent_batches(db: AsyncSession, limit: int = 100) -> dict[str, Any]:
    rows = (await db.execute(
        select(ProdBatch)
        .where(ProdBatch.is_voided.is_(False))
        .order_by(ProdBatch.production_date.desc(), ProdBatch.id.desc())
        .limit(limit)
    )).scalars().all()
    items = [
        {
            "id": r.id,
            "batch_code": r.batch_code,
            "product_code": r.product_code,
            "product_name": r.product_name,
            "production_date": r.production_date.isoformat() if r.production_date else None,
            "shift": (r.shift.value if hasattr(r.shift, "value") else r.shift) if r.shift is not None else None,
        }
        for r in rows
    ]
    return {"items": items, "total": len(items), "synced_at": utc_now()}


async def fetch_inventory_items(db: AsyncSession) -> dict[str, Any]:
    rows = (await db.execute(
        select(InvItem).where(InvItem.is_active.is_(True)).order_by(InvItem.code)
    )).scalars().all()
    items = [
        {
            "id": r.id,
            "code": r.code,
            "name": r.name,
            "category": r.category,
            "base_unit": r.base_unit,
            "usage_unit": r.usage_unit,
            "is_active": r.is_active,
        }
        for r in rows
    ]
    return {"items": items, "total": len(items), "synced_at": utc_now()}


# ---------------------------------------------------------------------------
# Plan / recipe normalization (ported from production_helper/app.py)
# ---------------------------------------------------------------------------

def normalize_plan_item(data: dict[str, Any], existing_id: str | None = None) -> dict[str, Any]:
    now = utc_now()
    item_type = data.get("type") or "plan"
    base: dict[str, Any] = {
        "id": existing_id or data.get("id") or str(uuid.uuid4()),
        "type": item_type,
        "week": data.get("week") or "",
        "date": data.get("date") or "",
        "day": data.get("day") or "",
        "station": data.get("station") or "面点",
        "updated_at": now,
    }
    if data.get("created_at"):
        base["created_at"] = data["created_at"]
    else:
        base["created_at"] = now
    if item_type == "note":
        base["title"] = data.get("title") or ""
        base["content"] = data.get("content") or ""
    else:
        base["product_id"] = data.get("product_id")
        base["product_code"] = data.get("product_code") or ""
        base["product_name"] = data.get("product_name") or ""
        base["main_material_name"] = data.get("main_material_name") or ""
        base["main_material_qty_kg"] = data.get("main_material_qty_kg") or ""
        base["notes"] = data.get("notes") or ""
    return base


def normalize_recipe(data: dict[str, Any], existing_id: str | None = None) -> dict[str, Any]:
    recipe_id = existing_id or data.get("id") or str(uuid.uuid4())
    auxiliaries = []
    for aux in data.get("auxiliaries", []):
        if not aux.get("item_name") and not aux.get("item_id"):
            continue
        auxiliaries.append(
            {
                "item_id": aux.get("item_id"),
                "item_code": aux.get("item_code") or "",
                "item_name": aux.get("item_name") or "",
                "unit": aux.get("unit") or "",
                "qty_per_kg_main_material": aux.get("qty_per_kg_main_material") or "",
            }
        )
    return {
        "id": recipe_id,
        "product_id": data.get("product_id"),
        "product_code": data.get("product_code") or "",
        "product_name": data.get("product_name") or "",
        "main_material_name": data.get("main_material_name") or "",
        "auxiliaries": auxiliaries,
        "updated_at": utc_now(),
    }


# ---------------------------------------------------------------------------
# Purchase requirements calculation (plans × recipes)
# ---------------------------------------------------------------------------

def previous_workday(value: str) -> str:
    current = date.fromisoformat(value) - timedelta(days=1)
    while current.weekday() >= 5:
        current -= timedelta(days=1)
    return current.isoformat()


def purchase_requirements(week: str | None = None) -> list[dict[str, Any]]:
    plans = read_json("plans.json").get("items", [])
    recipes = read_json("recipes.json").get("recipes", [])
    recipe_by_product = {str(r.get("product_id")): r for r in recipes}
    main_totals: dict[tuple[str, str], dict[str, Any]] = {}
    aux_totals: dict[tuple[str, str], dict[str, Any]] = {}

    for item in plans:
        if week and item.get("week") != week:
            continue
        if item.get("type") == "note":
            continue
        production_date = item.get("date")
        if not production_date:
            continue
        try:
            main_qty = float(item.get("main_material_qty_kg") or 0)
        except (TypeError, ValueError):
            main_qty = 0
        if main_qty <= 0:
            continue
        due_date = previous_workday(production_date)
        source = {
            "date": production_date,
            "product_code": item.get("product_code"),
            "product_name": item.get("product_name"),
            "main_material_qty_kg": main_qty,
        }

        main_name = item.get("main_material_name") or ""
        if main_name:
            key = (due_date, main_name)
            entry = main_totals.setdefault(
                key,
                {
                    "required_date": production_date,
                    "due_date": due_date,
                    "item_id": None,
                    "item_code": "",
                    "item_name": main_name,
                    "unit": "kg",
                    "total_qty": 0.0,
                    "material_type": "main",
                    "source_products": [],
                },
            )
            entry["total_qty"] += main_qty
            entry["source_products"].append(source)

        product_id = str(item.get("product_id", ""))
        recipe = recipe_by_product.get(product_id)
        if not recipe:
            continue
        for aux in recipe.get("auxiliaries", []):
            try:
                ratio = float(aux.get("qty_per_kg_main_material") or 0)
            except (TypeError, ValueError):
                ratio = 0
            if ratio <= 0:
                continue
            key = (due_date, str(aux.get("item_id") or aux.get("item_name") or ""))
            entry = aux_totals.setdefault(
                key,
                {
                    "required_date": production_date,
                    "due_date": due_date,
                    "item_id": aux.get("item_id"),
                    "item_code": aux.get("item_code"),
                    "item_name": aux.get("item_name"),
                    "unit": aux.get("unit") or "",
                    "total_qty": 0.0,
                    "material_type": "aux",
                    "source_products": [],
                },
            )
            entry["total_qty"] += main_qty * ratio
            entry["source_products"].append(source)

    result = list(main_totals.values()) + list(aux_totals.values())
    result.sort(key=lambda x: (x["due_date"], 0 if x.get("material_type") == "main" else 1, x.get("item_name") or ""))
    for row in result:
        row["total_qty"] = round(row["total_qty"], 3)
    return result


def purchase_csv(week: str | None = None) -> str:
    rows = purchase_requirements(week)
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["应到货日期", "类型", "代码", "名称", "单位", "叫货量", "来源产品"])
    for row in rows:
        sources = "; ".join(
            f"{s.get('date')} {s.get('product_code') or ''} {s.get('product_name') or ''} {s.get('main_material_qty_kg')}kg"
            for s in row["source_products"]
        )
        type_label = "主料" if row.get("material_type") == "main" else "辅料"
        writer.writerow(
            [
                row["due_date"],
                type_label,
                row.get("item_code") or "",
                row.get("item_name") or "",
                row.get("unit") or "",
                row["total_qty"],
                sources,
            ]
        )
    return out.getvalue()


# ---------------------------------------------------------------------------
# Router — every endpoint guarded by Captain role
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/production-helper", tags=["production-helper"])
_captain = require_role("Captain")


@router.get("/health")
async def health(_: User = Depends(_captain)) -> dict[str, Any]:
    return {"ok": True, "time": utc_now()}


@router.get("/bootstrap")
async def bootstrap(
    _: User = Depends(_captain),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return {
        "products": await fetch_products(db),
        "recent_batches": await fetch_recent_batches(db),
        "inventory_items": await fetch_inventory_items(db),
        "plans": read_json("plans.json"),
        "recipes": read_json("recipes.json"),
        "purchase_status": read_json("purchase_status.json"),
        "config": {},
    }


# --- plans ---

@router.get("/plans")
async def list_plans(
    week: str | None = Query(None),
    _: User = Depends(_captain),
) -> dict[str, Any]:
    items = read_json("plans.json").get("items", [])
    if week:
        items = [item for item in items if item.get("week") == week]
    return {"items": items}


@router.post("/plans", status_code=status.HTTP_201_CREATED)
async def create_plan(request: Request, _: User = Depends(_captain)) -> dict[str, Any]:
    payload = await request.json()
    plans = read_json("plans.json")
    item = normalize_plan_item(payload)
    plans["items"].append(item)
    write_json("plans.json", plans)
    return item


@router.put("/plans/{item_id}")
async def update_plan(
    item_id: str,
    request: Request,
    _: User = Depends(_captain),
) -> dict[str, Any]:
    payload = await request.json()
    plans = read_json("plans.json")
    for idx, item in enumerate(plans["items"]):
        if item.get("id") == item_id:
            merged = {**item, **payload, "id": item_id}
            plans["items"][idx] = normalize_plan_item(merged, item_id)
            write_json("plans.json", plans)
            return plans["items"][idx]
    raise HTTPException(status_code=404, detail="Plan item not found")


@router.delete("/plans/{item_id}")
async def delete_plan(item_id: str, _: User = Depends(_captain)) -> dict[str, Any]:
    plans = read_json("plans.json")
    before = len(plans["items"])
    plans["items"] = [item for item in plans["items"] if item.get("id") != item_id]
    write_json("plans.json", plans)
    return {"deleted": before - len(plans["items"])}


# --- recipes ---

@router.get("/recipes")
async def list_recipes(_: User = Depends(_captain)) -> dict[str, Any]:
    return read_json("recipes.json")


@router.post("/recipes", status_code=status.HTTP_201_CREATED)
async def create_recipe(request: Request, _: User = Depends(_captain)) -> dict[str, Any]:
    payload = await request.json()
    recipes = read_json("recipes.json")
    recipe = normalize_recipe(payload)
    recipes["recipes"].append(recipe)
    write_json("recipes.json", recipes)
    return recipe


@router.put("/recipes/{recipe_id}")
async def update_recipe(
    recipe_id: str,
    request: Request,
    _: User = Depends(_captain),
) -> dict[str, Any]:
    payload = await request.json()
    recipes = read_json("recipes.json")
    for idx, recipe in enumerate(recipes["recipes"]):
        if recipe.get("id") == recipe_id:
            merged = {**recipe, **payload, "id": recipe_id}
            recipes["recipes"][idx] = normalize_recipe(merged, recipe_id)
            write_json("recipes.json", recipes)
            return recipes["recipes"][idx]
    raise HTTPException(status_code=404, detail="Recipe not found")


@router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, _: User = Depends(_captain)) -> dict[str, Any]:
    recipes = read_json("recipes.json")
    before = len(recipes["recipes"])
    recipes["recipes"] = [r for r in recipes["recipes"] if r.get("id") != recipe_id]
    write_json("recipes.json", recipes)
    return {"deleted": before - len(recipes["recipes"])}


# --- purchase status ---

@router.get("/purchase-status")
async def get_purchase_status(_: User = Depends(_captain)) -> dict[str, Any]:
    return read_json("purchase_status.json")


@router.post("/purchase-status")
async def set_purchase_status(
    request: Request,
    _: User = Depends(_captain),
) -> dict[str, Any]:
    payload = await request.json()
    key = str(payload.get("key") or "")
    if not key:
        raise HTTPException(status_code=400, detail="key required")
    ordered = bool(payload.get("ordered", True))
    status_data = read_json("purchase_status.json")
    keys = set(status_data.get("ordered_keys", []))
    if ordered:
        keys.add(key)
    else:
        keys.discard(key)
    write_json("purchase_status.json", {"ordered_keys": sorted(keys)})
    return {"ordered_keys": sorted(keys)}


# --- purchase requirements ---

@router.get("/purchase-requirements")
async def get_purchase_requirements(
    week: str | None = Query(None),
    _: User = Depends(_captain),
) -> dict[str, Any]:
    return {"items": purchase_requirements(week)}


@router.get("/purchase-requirements.csv")
async def get_purchase_requirements_csv(
    week: str | None = Query(None),
    _: User = Depends(_captain),
) -> Response:
    body = "﻿" + purchase_csv(week)
    return Response(content=body, media_type="text/csv; charset=utf-8")
