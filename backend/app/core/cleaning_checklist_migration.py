"""Apply the packaged cleaning checklist schema to existing databases."""

from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


async def migrate_cleaning_checklists(engine: AsyncEngine) -> None:
    statements = Path(__file__).with_name("cleaning_checklists.sql").read_text(encoding="utf-8").split("-- statement\n")
    async with engine.begin() as conn:
        for statement in statements:
            if statement.strip():
                await conn.execute(text(statement))
