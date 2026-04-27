#!/bin/sh
set -e

# If users table doesn't exist, this is a fresh database — run init.sql
python3 - <<'PYEOF'
import asyncio, asyncpg, os

async def init():
    url = os.environ['DATABASE_URL'].replace('postgresql+asyncpg://', 'postgresql://')
    conn = await asyncpg.connect(url)
    try:
        exists = await conn.fetchval(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users')"
        )
        if not exists:
            print("Fresh database — running init.sql")
            with open('/app/init.sql') as f:
                await conn.execute(f.read())
            print("Schema initialized successfully")
        else:
            print("Schema exists — skipping init.sql")
    finally:
        await conn.close()

asyncio.run(init())
PYEOF

exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
