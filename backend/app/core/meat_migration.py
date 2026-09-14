"""Packaged SQL is mirrored in database/migrations and the initial schema."""
from pathlib import Path
from sqlalchemy import text


async def migrate_meat(engine):
    statements = Path(__file__).with_name("meat_processing.sql").read_text(encoding="utf-8").split("-- statement\n")
    # PostgreSQL requires an enum addition to commit before a new value is used.
    for statement in statements[:2]:
        async with engine.begin() as conn:
            await conn.execute(text(statement))
    async with engine.begin() as conn:
        for statement in statements[2:]:
            if statement.strip():
                await conn.execute(text(statement))
