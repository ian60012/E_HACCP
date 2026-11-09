"""Startup enum migrations on a fresh init.sql database and an older database.

Set TEST_STARTUP_ADMIN_URL to a PostgreSQL admin URL, for example
postgresql://haccp_user:haccp_password@127.0.0.1:5432/postgres.
The integration tests create randomly named databases and drop only those.
"""

import asyncio
import os
import subprocess
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlparse

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://localhost/unused_startup_test")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault(
    "PRODUCTION_HELPER_DATA_DIR",
    str(Path(tempfile.gettempdir()) / "haccp-startup-helper"),
)
os.environ.setdefault(
    "QUALITY_PHOTO_DIR",
    str(Path(tempfile.gettempdir()) / "haccp-startup-photos"),
)

from app.core.enum_migration import is_enum_statement, split_statements
from app.main import app
import app.main as main
from sqlalchemy.ext.asyncio import create_async_engine

ROOT = Path(__file__).resolve().parents[2]
INIT_SQL = ROOT / "database" / "init.sql"
ITEM_TYPE_SQL = ROOT / "backend" / "app" / "core" / "item_type.sql"
ROLE_LABELS = ("Admin", "QA", "QC", "Production", "Warehouse", "Captain")
ITEM_LABELS = ("raw", "intermediate", "finished", "packaging")
QA_TRIGGERS = {
    "cooking_logs.trg_prevent_delete_cooking_logs",
    "cooking_logs.trg_prevent_locked_mod_cooking_logs",
    "audit_log.trg_prevent_delete_audit_log",
    "receiving_logs.trg_prevent_delete_receiving_logs",
    "receiving_logs.trg_prevent_locked_mod_receiving_logs",
}


def test_packaged_enum_sql_commits_labels_before_using_them():
    packaged = ITEM_TYPE_SQL.read_text(encoding="utf-8")
    assert packaged == (ROOT / "database/migrations/20261109_ensure_item_type_enum.sql").read_text(encoding="utf-8")
    parts = split_statements(packaged)
    enum_parts = [part for part in parts if is_enum_statement(part)]
    later = [part for part in parts if not is_enum_statement(part)]
    assert any("CREATE TYPE item_type_enum" in part for part in enum_parts)
    for label in ITEM_LABELS:
        assert any(f"ADD VALUE IF NOT EXISTS '{label}'" in part for part in enum_parts)
    assert all("UPDATE inv_items" not in part for part in enum_parts)
    assert any("UPDATE inv_items" in part for part in later)
    assert any("item_type_scope" in part for part in later)
    assert "ADD COLUMN IF NOT EXISTS item_type_scope item_type_enum" not in (
        ROOT / "backend/app/main.py"
    ).read_text(encoding="utf-8")

    quality = (ROOT / "backend/app/core/quality_control.sql").read_text(encoding="utf-8")
    quality_parts = split_statements(quality)
    assert is_enum_statement(quality_parts[0])
    assert "CREATE TYPE user_role_enum" in quality_parts[0]
    qc_adds = [
        part for part in quality_parts
        if "ADD VALUE IF NOT EXISTS 'QC'" in part
    ]
    assert len(qc_adds) == 1 and is_enum_statement(qc_adds[0])
    assert any(
        "CREATE TABLE IF NOT EXISTS quality_control_settings" in part and not is_enum_statement(part)
        for part in quality_parts
    )
    for path in (
        ROOT / "database/migrations/20261104_add_qc_role.sql",
        ROOT / "database/migrations/20261104_batch_quality_control.sql",
        ROOT / "database/migrations/20260915_inventory_doc_scope.sql",
    ):
        sql = path.read_text(encoding="utf-8")
        assert "EXCEPTION WHEN duplicate_object THEN NULL;" in sql
        assert "ADD VALUE IF NOT EXISTS" in sql


def _admin_url():
    url = os.environ.get("TEST_STARTUP_ADMIN_URL")
    if not url:
        pytest.skip("Set TEST_STARTUP_ADMIN_URL for startup migration integration tests")
    return url


def _db_url(admin_url, name):
    return admin_url.rsplit("/", 1)[0] + "/" + name


def _psql(admin_url, dbname, sql=None, file=None):
    parsed = urlparse(admin_url)
    env = os.environ.copy()
    if parsed.password:
        env["PGPASSWORD"] = parsed.password
    command = [
        "psql", "-v", "ON_ERROR_STOP=1", "-X", "-q",
        "-h", parsed.hostname or "127.0.0.1",
        "-p", str(parsed.port or 5432),
        "-U", parsed.username,
        "-d", dbname,
    ]
    if file is not None:
        command.extend(["-f", str(file)])
        subprocess.run(command, check=True, env=env)
    else:
        subprocess.run(command, input=sql, text=True, check=True, env=env)


async def _enum_labels(conn, type_name):
    rows = await conn.fetch("""
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = $1
        ORDER BY e.enumsortorder
    """, type_name)
    return [row["enumlabel"] for row in rows]


async def _enum_oid(conn, type_name):
    return await conn.fetchval("""
        SELECT t.oid
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = $1
    """, type_name)


async def _enabled_triggers(conn):
    rows = await conn.fetch("""
        SELECT c.relname || '.' || t.tgname AS name
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgenabled = 'O'
    """)
    return {row["name"] for row in rows}


async def _run_lifespan(admin_url, dbname):
    import asyncpg
    engine = create_async_engine(
        _db_url(admin_url, dbname).replace("postgresql://", "postgresql+asyncpg://", 1)
    )
    original = main.engine
    main.engine = engine
    try:
        async with main.lifespan(app):
            pass
    finally:
        main.engine = original
        await engine.dispose()
        # Drop pooled connections before the test drops the database.
        leftover = await asyncpg.connect(_db_url(admin_url, dbname))
        await leftover.close()


def _create_database(admin_url, name):
    import asyncpg

    async def create():
        conn = await asyncpg.connect(admin_url)
        await conn.execute(f'CREATE DATABASE "{name}"')
        await conn.close()

    asyncio.run(create())
    _psql(admin_url, name, file=INIT_SQL)


def _drop_database(admin_url, name):
    import asyncpg

    async def drop():
        conn = await asyncpg.connect(admin_url)
        await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        await conn.close()

    asyncio.run(drop())


def _new_name(prefix):
    return prefix + uuid.uuid4().hex[:12]


async def _assert_qa_locks_hold(conn):
    import asyncpg
    with pytest.raises(asyncpg.PostgresError, match="DELETE operations are not permitted"):
        await conn.execute("DELETE FROM cooking_logs WHERE batch_id = 'KEEP-COOK'")
    with pytest.raises(asyncpg.PostgresError, match="Cannot modify locked record"):
        await conn.execute("UPDATE cooking_logs SET notes = 'changed' WHERE batch_id = 'KEEP-COOK'")
    with pytest.raises(asyncpg.PostgresError, match="DELETE operations are not permitted"):
        await conn.execute("DELETE FROM audit_log WHERE reason = 'keep-audit'")
    assert await conn.fetchval("SELECT notes FROM cooking_logs WHERE batch_id = 'KEEP-COOK'") == "locked-note"
    assert await conn.fetchval("SELECT reason FROM audit_log WHERE reason = 'keep-audit'") == "keep-audit"
    await conn.execute("UPDATE cooking_logs SET notes = 'edited' WHERE batch_id = 'KEEP-OPEN'")
    assert await conn.fetchval("SELECT notes FROM cooking_logs WHERE batch_id = 'KEEP-OPEN'") == "edited"


async def _seed_protected_rows(conn):
    await conn.execute("""
        INSERT INTO cooking_logs (batch_id, start_time, operator_id, is_locked, notes)
        SELECT 'KEEP-COOK', NOW(), id, TRUE, 'locked-note'
        FROM users WHERE username = 'production1'
    """)
    await conn.execute("""
        INSERT INTO cooking_logs (batch_id, start_time, operator_id, is_locked, notes)
        SELECT 'KEEP-OPEN', NOW(), id, FALSE, 'open-note'
        FROM users WHERE username = 'production1'
    """)
    await conn.execute("""
        INSERT INTO audit_log (table_name, record_id, action, reason)
        VALUES ('cooking_logs', 1, 'LOCK', 'keep-audit')
    """)


@pytest.fixture()
def startup_database():
    admin_url = _admin_url()
    name = _new_name("startup_case_")
    _create_database(admin_url, name)
    try:
        yield admin_url, name
    finally:
        _drop_database(admin_url, name)


def test_fresh_init_sql_startup_is_idempotent(startup_database):
    import asyncpg
    admin_url, name = startup_database

    async def scenario():
        conn = await asyncpg.connect(_db_url(admin_url, name))
        before_oid = await _enum_oid(conn, "item_type_enum")
        assert await _enum_labels(conn, "item_type_enum") == list(ITEM_LABELS)
        assert set(await _enum_labels(conn, "user_role_enum")) == set(ROLE_LABELS)
        triggers_before = await _enabled_triggers(conn)
        assert QA_TRIGGERS <= triggers_before
        await conn.execute("""
            INSERT INTO inv_items (code, name, item_type, category, base_unit)
            VALUES ('FRESH-HOT', 'Hot item', 'raw', '熱加工', 'KG')
        """)
        await conn.execute("""
            INSERT INTO inv_stock_docs (doc_number, doc_type, status, notes)
            VALUES ('FRESH-DOC', 'IN', 'Draft', 'preserve-me')
        """)
        await _seed_protected_rows(conn)
        user_count = await conn.fetchval("SELECT count(*) FROM users")
        await conn.close()

        await _run_lifespan(admin_url, name)
        await _run_lifespan(admin_url, name)

        conn = await asyncpg.connect(_db_url(admin_url, name))
        assert await _enum_oid(conn, "item_type_enum") == before_oid
        assert await _enum_labels(conn, "item_type_enum") == list(ITEM_LABELS)
        assert set(await _enum_labels(conn, "user_role_enum")) == set(ROLE_LABELS)
        assert QA_TRIGGERS <= await _enabled_triggers(conn)
        item = await conn.fetchrow("SELECT item_type::text AS item_type, category FROM inv_items WHERE code = 'FRESH-HOT'")
        assert item["item_type"] == "raw"
        assert item["category"] == "熱加工"
        doc = await conn.fetchrow("SELECT notes, item_type_scope::text AS scope FROM inv_stock_docs WHERE doc_number = 'FRESH-DOC'")
        assert doc["notes"] == "preserve-me" and doc["scope"] is None
        assert await conn.fetchval("SELECT count(*) FROM users") == user_count
        assert await conn.fetchval(
            "SELECT role::text FROM users WHERE username = 'production1'"
        ) == "Production"
        await _assert_qa_locks_hold(conn)
        await conn.close()

    asyncio.run(scenario())


def test_startup_repairs_database_missing_item_type_enum(startup_database):
    import asyncpg
    admin_url, name = startup_database

    async def scenario():
        conn = await asyncpg.connect(_db_url(admin_url, name))
        triggers_before = await _enabled_triggers(conn)
        await conn.execute("""
            DROP INDEX IF EXISTS idx_inv_items_item_type;
            ALTER TABLE inv_items DROP COLUMN IF EXISTS item_type;
            ALTER TABLE inv_stock_docs DROP COLUMN IF EXISTS item_type_scope;
            DROP TYPE item_type_enum;
            ALTER TYPE user_role_enum RENAME TO user_role_enum_old;
            CREATE TYPE user_role_enum AS ENUM ('Admin', 'QA', 'Production', 'Warehouse', 'Captain');
            ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
            ALTER TABLE users
                ALTER COLUMN role TYPE user_role_enum
                USING role::text::user_role_enum;
            ALTER TABLE users ALTER COLUMN role SET DEFAULT 'Production';
            DROP TYPE user_role_enum_old;
        """)
        assert await _enum_oid(conn, "item_type_enum") is None
        assert "QC" not in await _enum_labels(conn, "user_role_enum")
        await conn.execute("""
            INSERT INTO inv_items (code, name, category, base_unit) VALUES
                ('KEEP-RAW', 'Raw keep', '肉類', 'KG'),
                ('KEEP-HOT', 'Hot keep', '熱加工', 'KG'),
                ('KEEP-PACK', 'Pack keep', '包材', 'PCS'),
                ('KEEP-FROZEN', 'Frozen keep', 'Frozen Dumpling', 'KG')
        """)
        await conn.execute("""
            INSERT INTO inv_stock_docs (doc_number, doc_type, status, notes)
            VALUES ('KEEP-DOC', 'IN', 'Posted', 'preserve-me')
        """)
        await _seed_protected_rows(conn)
        doc_id = await conn.fetchval("SELECT id FROM inv_stock_docs WHERE doc_number = 'KEEP-DOC'")
        user_count = await conn.fetchval("SELECT count(*) FROM users")
        await conn.close()

        await _run_lifespan(admin_url, name)

        conn = await asyncpg.connect(_db_url(admin_url, name))
        assert await _enum_labels(conn, "item_type_enum") == list(ITEM_LABELS)
        assert set(await _enum_labels(conn, "user_role_enum")) == set(ROLE_LABELS)
        assert QA_TRIGGERS <= triggers_before
        assert QA_TRIGGERS <= await _enabled_triggers(conn)
        rows = {
            row["code"]: (row["item_type"], row["category"])
            for row in await conn.fetch(
                "SELECT code, item_type::text AS item_type, category FROM inv_items WHERE code LIKE 'KEEP-%'"
            )
        }
        assert rows == {
            "KEEP-RAW": ("raw", "肉類"),
            "KEEP-HOT": ("finished", "熱加工"),
            "KEEP-PACK": ("packaging", "包材"),
            "KEEP-FROZEN": ("finished", "Frozen Dumpling"),
        }
        doc = await conn.fetchrow(
            "SELECT id, notes, status::text AS status, item_type_scope::text AS scope FROM inv_stock_docs WHERE doc_number = 'KEEP-DOC'"
        )
        assert doc["id"] == doc_id
        assert doc["notes"] == "preserve-me" and doc["status"] == "Posted" and doc["scope"] is None
        assert await conn.fetchval("SELECT to_regclass('public.ix_inv_stock_docs_item_type_scope')") is not None
        assert await conn.fetchval("SELECT to_regclass('public.idx_inv_items_item_type')") is not None
        assert await conn.fetchval("SELECT count(*) FROM users") == user_count
        assert await conn.fetchval("SELECT role::text FROM users WHERE username = 'production1'") == "Production"
        await conn.execute("""
            INSERT INTO users (username, password_hash, full_name, role)
            VALUES ('qc-new', 'unused', 'QC User', 'QC')
        """)
        await conn.execute("""
            INSERT INTO inv_stock_docs (doc_number, doc_type, item_type_scope)
            VALUES ('SCOPED', 'OUT', 'finished')
        """)
        with pytest.raises(asyncpg.PostgresError):
            await conn.execute("""
                INSERT INTO inv_stock_docs (doc_number, doc_type, item_type_scope)
                VALUES ('BAD-SCOPE', 'IN', 'not-a-type')
            """)
        await conn.execute("UPDATE inv_items SET item_type = 'raw' WHERE code = 'KEEP-HOT'")
        await _assert_qa_locks_hold(conn)
        await conn.close()

        await _run_lifespan(admin_url, name)

        conn = await asyncpg.connect(_db_url(admin_url, name))
        assert await conn.fetchval("SELECT item_type::text FROM inv_items WHERE code = 'KEEP-HOT'") == "raw"
        assert await conn.fetchval("SELECT category FROM inv_items WHERE code = 'KEEP-HOT'") == "熱加工"
        assert await conn.fetchval("SELECT count(*) FROM users WHERE username = 'qc-new' AND role = 'QC'") == 1
        assert await conn.fetchval("SELECT notes FROM inv_stock_docs WHERE doc_number = 'KEEP-DOC'") == "preserve-me"
        await _assert_qa_locks_hold(conn)
        await conn.close()

    asyncio.run(scenario())


def test_partial_enum_is_extended_without_recreate_or_rewrite(startup_database):
    import asyncpg
    admin_url, name = startup_database

    async def scenario():
        conn = await asyncpg.connect(_db_url(admin_url, name))
        await conn.execute("""
            ALTER TABLE inv_items DROP COLUMN item_type;
            ALTER TABLE inv_stock_docs DROP COLUMN item_type_scope;
            DROP TYPE item_type_enum;
            CREATE TYPE item_type_enum AS ENUM ('raw', 'finished');
            ALTER TABLE inv_items
                ADD COLUMN item_type item_type_enum NOT NULL DEFAULT 'raw';
        """)
        oid = await _enum_oid(conn, "item_type_enum")
        await conn.execute("""
            INSERT INTO inv_items (code, name, item_type, category, base_unit)
            VALUES ('PARTIAL-HOT', 'Already classified', 'raw', '熱加工', 'KG')
        """)
        await conn.close()

        await _run_lifespan(admin_url, name)
        await _run_lifespan(admin_url, name)

        conn = await asyncpg.connect(_db_url(admin_url, name))
        assert await _enum_oid(conn, "item_type_enum") == oid
        assert await _enum_labels(conn, "item_type_enum") == ["raw", "finished", "intermediate", "packaging"]
        assert await conn.fetchval("SELECT item_type::text FROM inv_items WHERE code = 'PARTIAL-HOT'") == "raw"
        assert await conn.fetchval("SELECT category FROM inv_items WHERE code = 'PARTIAL-HOT'") == "熱加工"
        assert await conn.fetchval("""
            SELECT count(*) FROM information_schema.columns
            WHERE table_name = 'inv_stock_docs' AND column_name = 'item_type_scope'
        """) == 1
        await conn.close()

    asyncio.run(scenario())


def test_item_type_sql_file_repairs_old_and_partial_enums(startup_database):
    import asyncpg
    admin_url, name = startup_database

    async def prepare():
        conn = await asyncpg.connect(_db_url(admin_url, name))
        await conn.execute("""
            ALTER TABLE inv_items DROP COLUMN item_type;
            ALTER TABLE inv_stock_docs DROP COLUMN item_type_scope;
            DROP TYPE item_type_enum;
        """)
        await conn.execute("""
            INSERT INTO inv_items (code, name, category, base_unit)
            VALUES ('SQL-HOT', 'Hot', '熱加工', 'KG'), ('SQL-OTHER', 'Other', '肉類', 'KG')
        """)
        await conn.close()

    asyncio.run(prepare())
    _psql(admin_url, name, file=ITEM_TYPE_SQL)
    _psql(admin_url, name, file=ITEM_TYPE_SQL)

    async def check():
        conn = await asyncpg.connect(_db_url(admin_url, name))
        assert await _enum_labels(conn, "item_type_enum") == list(ITEM_LABELS)
        assert await conn.fetchval("SELECT item_type::text FROM inv_items WHERE code = 'SQL-HOT'") == "finished"
        assert await conn.fetchval("SELECT category FROM inv_items WHERE code = 'SQL-OTHER'") == "肉類"
        await conn.execute("UPDATE inv_items SET item_type = 'intermediate' WHERE code = 'SQL-HOT'")
        await conn.close()

    asyncio.run(check())
    _psql(admin_url, name, file=ITEM_TYPE_SQL)

    async def check_again():
        conn = await asyncpg.connect(_db_url(admin_url, name))
        assert await conn.fetchval("SELECT item_type::text FROM inv_items WHERE code = 'SQL-HOT'") == "intermediate"
        await conn.close()

    asyncio.run(check_again())
