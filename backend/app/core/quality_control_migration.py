"""Apply the packaged batch quality-control schema to existing databases."""

from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.enum_migration import USER_ROLE_LABELS, apply_startup_sql, ensure_pg_enum


async def migrate_quality_control(engine: AsyncEngine) -> None:
    # Commit QC (and any other missing role label) before the packaged SQL.
    # A label added with ALTER TYPE ... ADD VALUE cannot be used until it commits.
    await ensure_pg_enum(engine, "user_role_enum", USER_ROLE_LABELS)
    sql = Path(__file__).with_name("quality_control.sql").read_text(encoding="utf-8")
    await apply_startup_sql(engine, sql)
