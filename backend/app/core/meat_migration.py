"""Packaged SQL is mirrored in database/migrations and the initial schema."""
from pathlib import Path

from app.core.enum_migration import (
    PROD_BATCH_STATUS_LABELS,
    PROD_PRODUCT_TYPE_LABELS,
    apply_startup_sql,
    ensure_pg_enum,
)


async def migrate_meat(engine):
    # Older installations created these enums without meat_processing / packed.
    # Add the missing labels in their own transactions before the packaged SQL
    # runs. Existing enum rows and label order are left in place.
    await ensure_pg_enum(engine, "prod_product_type_enum", PROD_PRODUCT_TYPE_LABELS)
    await ensure_pg_enum(engine, "prod_batch_status_enum", PROD_BATCH_STATUS_LABELS)
    sql = Path(__file__).with_name("meat_processing.sql").read_text(encoding="utf-8")
    await apply_startup_sql(engine, sql)
