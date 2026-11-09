"""Commit-safe helpers for startup enum changes.

PostgreSQL accepts ``ALTER TYPE ... ADD VALUE`` inside a transaction, but a
label added that way cannot be used until the transaction commits. These
helpers create a missing enum, add only missing labels, and commit those
changes before later statements use them. Existing labels and rows are kept.
"""

import re
from collections.abc import Sequence

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_LABEL = re.compile(r"^[A-Za-z0-9_]+$")

# Labels match database/init.sql and backend/app/models/enums.py.
USER_ROLE_LABELS = ("Admin", "QA", "QC", "Production", "Warehouse", "Captain")
ITEM_TYPE_LABELS = ("raw", "intermediate", "finished", "packaging")
PROD_PRODUCT_TYPE_LABELS = ("forming", "hot_process", "meat_processing")
PROD_BATCH_STATUS_LABELS = ("open", "packed", "closed")


def split_statements(sql: str) -> list[str]:
    return [part for part in sql.split("-- statement\n") if part.strip()]


def _statement_body(statement: str) -> str:
    lines = [
        line
        for line in statement.splitlines()
        if line.strip() and not line.strip().startswith("--")
    ]
    return " ".join(" ".join(lines).split()).lower()


def is_enum_statement(statement: str) -> bool:
    """True for CREATE TYPE / ALTER TYPE statements that must commit alone."""
    body = _statement_body(statement)
    if body.startswith("alter type"):
        return True
    return body.startswith("do") and "create type" in body


async def ensure_pg_enum(engine: AsyncEngine, type_name: str, labels: Sequence[str]) -> None:
    """Create ``type_name`` when missing, then add any canonical label it lacks.

    The type is never dropped or reordered. A label that already exists is left
    in place, including labels that are not in ``labels``.
    """
    if _IDENT.fullmatch(type_name) is None:
        raise ValueError(f"invalid enum type name: {type_name}")
    if not labels or any(_LABEL.fullmatch(label) is None for label in labels):
        raise ValueError(f"invalid enum labels for {type_name}")

    quoted = ", ".join(f"'{label}'" for label in labels)
    async with engine.begin() as conn:
        await conn.execute(text(f"""
            DO $$ BEGIN
                CREATE TYPE public.{type_name} AS ENUM ({quoted});
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """))
        result = await conn.execute(
            text("""
                SELECT e.enumlabel
                FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname = 'public' AND t.typname = :type_name
            """),
            {"type_name": type_name},
        )
        present = {row[0] for row in result}

    for label in labels:
        if label in present:
            continue
        async with engine.begin() as conn:
            await conn.execute(text(
                f"ALTER TYPE public.{type_name} ADD VALUE IF NOT EXISTS '{label}'"
            ))


async def apply_startup_sql(engine: AsyncEngine, sql: str) -> None:
    """Run packaged SQL, committing enum DDL before later statements use it."""
    pending: list[str] = []

    async def flush() -> None:
        if not pending:
            return
        async with engine.begin() as conn:
            for statement in pending:
                await conn.execute(text(statement))
        pending.clear()

    for statement in split_statements(sql):
        if is_enum_statement(statement):
            await flush()
            async with engine.begin() as conn:
                await conn.execute(text(statement))
        else:
            pending.append(statement)
    await flush()
