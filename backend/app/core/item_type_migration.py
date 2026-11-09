"""Ensure item_type_enum and the columns that use it exist on older databases."""

from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.enum_migration import ITEM_TYPE_LABELS, apply_startup_sql, ensure_pg_enum


async def migrate_item_type(engine: AsyncEngine) -> None:
    # Create or extend the enum in committed transactions before the packaged
    # SQL adds columns and, on first install of the column, classifies rows.
    await ensure_pg_enum(engine, "item_type_enum", ITEM_TYPE_LABELS)
    sql = Path(__file__).with_name("item_type.sql").read_text(encoding="utf-8")
    await apply_startup_sql(engine, sql)
