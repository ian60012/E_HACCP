"""
FD Catering HACCP eQMS System — FastAPI Application.

v2.0.0: Full rewrite with ALCOA+ compliance, 12 API routers,
         CCP validation, QA lock/void workflow.

Database schema managed by database/init.sql (NOT SQLAlchemy create_all).
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine

# Router imports
from app.routers.api.v1 import auth
from app.routers.api.v1 import users
from app.routers.api.v1 import products
from app.routers.api.v1 import suppliers
from app.routers.api.v1 import equipment
from app.routers.api.v1 import areas
from app.routers.api.v1 import cooking_logs
from app.routers.api.v1 import receiving_logs
from app.routers.api.v1 import cooling_logs
from app.routers.api.v1 import sanitising_logs
from app.routers.api.v1 import assembly_packing_logs
from app.routers.api.v1 import deviation_logs
from app.routers.api.v1 import inventory_items
from app.routers.api.v1 import inventory_locations
from app.routers.api.v1 import inventory_docs
from app.routers.api.v1 import inventory_balance
from app.routers.api.v1 import production_products
from app.routers.api.v1 import production_pack_types
from app.routers.api.v1 import production_batches
from app.routers.api.v1 import production_repack


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    # Startup: Verify database connection (schema created by init.sql, NOT ORM)
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))
        # Idempotent column migrations (for databases created before this column was added)
        await conn.execute(
            text("ALTER TABLE cooking_logs ADD COLUMN IF NOT EXISTS quantity NUMERIC(8,3)")
        )
        await conn.execute(
            text("ALTER TABLE receiving_logs ADD COLUMN IF NOT EXISTS quantity NUMERIC(10,3)")
        )
        await conn.execute(
            text("ALTER TABLE receiving_logs ADD COLUMN IF NOT EXISTS quantity_unit VARCHAR(10)")
        )
        # Inventory module — create enum types if they don't exist
        await conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE inv_doc_type_enum AS ENUM ('IN', 'OUT');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """))
        await conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE inv_doc_status_enum AS ENUM ('Draft', 'Posted', 'Voided');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """))
        # Inventory tables
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS inv_items (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(200) NOT NULL,
                category VARCHAR(100),
                base_unit VARCHAR(20) NOT NULL DEFAULT 'PCS',
                description TEXT,
                supplier_id INTEGER REFERENCES suppliers(id),
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS inv_locations (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(200) NOT NULL,
                zone VARCHAR(100),
                is_active BOOLEAN NOT NULL DEFAULT TRUE
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS inv_stock_docs (
                id SERIAL PRIMARY KEY,
                doc_number VARCHAR(30) UNIQUE NOT NULL,
                doc_type inv_doc_type_enum NOT NULL,
                status inv_doc_status_enum NOT NULL DEFAULT 'Draft',
                location_id INTEGER REFERENCES inv_locations(id),
                receiving_log_id INTEGER REFERENCES receiving_logs(id),
                ref_number VARCHAR(100),
                notes TEXT,
                void_reason TEXT,
                operator_id INTEGER REFERENCES users(id),
                operator_name VARCHAR(100),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                posted_at TIMESTAMPTZ,
                voided_at TIMESTAMPTZ
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS inv_stock_lines (
                id SERIAL PRIMARY KEY,
                doc_id INTEGER NOT NULL REFERENCES inv_stock_docs(id) ON DELETE CASCADE,
                item_id INTEGER NOT NULL REFERENCES inv_items(id),
                quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
                unit VARCHAR(20) NOT NULL,
                unit_cost NUMERIC(12,2),
                notes TEXT
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS inv_stock_balance (
                item_id INTEGER NOT NULL REFERENCES inv_items(id),
                location_id INTEGER NOT NULL REFERENCES inv_locations(id),
                quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
                PRIMARY KEY (item_id, location_id)
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS inv_stock_movements (
                id SERIAL PRIMARY KEY,
                doc_id INTEGER NOT NULL REFERENCES inv_stock_docs(id),
                item_id INTEGER NOT NULL REFERENCES inv_items(id),
                location_id INTEGER NOT NULL REFERENCES inv_locations(id),
                delta NUMERIC(12,3) NOT NULL,
                balance_after NUMERIC(12,3) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        # Link columns on receiving_logs
        await conn.execute(text(
            "ALTER TABLE receiving_logs ADD COLUMN IF NOT EXISTS inv_item_id INTEGER REFERENCES inv_items(id)"
        ))
        await conn.execute(text(
            "ALTER TABLE receiving_logs ADD COLUMN IF NOT EXISTS inv_stock_doc_id INTEGER REFERENCES inv_stock_docs(id)"
        ))

        # ----- Production module -----
        await conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE prod_batch_status_enum AS ENUM ('open', 'closed');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """))
        await conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE prod_shift_enum AS ENUM ('Morning', 'Night');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """))
        await conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE prod_pack_type_enum AS ENUM ('4KG_SEMI', '1KG_FG', '0.5KG_FG', 'BULK_KG');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """))
        await conn.execute(text(
            "ALTER TYPE prod_pack_type_enum ADD VALUE IF NOT EXISTS 'BULK_KG'"
        ))
        await conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE prod_product_type_enum AS ENUM ('forming', 'hot_process');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS prod_products (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(200) NOT NULL,
                pack_size_kg NUMERIC(8,3),
                product_type prod_product_type_enum NOT NULL DEFAULT 'forming',
                inv_item_id INTEGER REFERENCES inv_items(id) ON DELETE SET NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text(
            "ALTER TABLE prod_products ADD COLUMN IF NOT EXISTS product_type prod_product_type_enum NOT NULL DEFAULT 'forming'"
        ))
        await conn.execute(text(
            "ALTER TABLE prod_products ADD COLUMN IF NOT EXISTS inv_item_id INTEGER REFERENCES inv_items(id) ON DELETE SET NULL"
        ))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS prod_batches (
                id SERIAL PRIMARY KEY,
                batch_code VARCHAR(50) UNIQUE NOT NULL,
                product_code VARCHAR(50) NOT NULL,
                product_name VARCHAR(200) NOT NULL,
                production_date DATE NOT NULL,
                shift prod_shift_enum,
                spec_piece_weight_g NUMERIC(8,2) NOT NULL DEFAULT 0,
                start_time TIMESTAMPTZ,
                end_time TIMESTAMPTZ,
                status prod_batch_status_enum NOT NULL DEFAULT 'open',
                operator VARCHAR(100),
                supervisor VARCHAR(100),
                estimated_forming_net_weight_kg NUMERIC(12,3),
                estimated_forming_pieces INTEGER,
                input_weight_kg NUMERIC(12,3),
                inv_stock_doc_id INTEGER REFERENCES inv_stock_docs(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text(
            "ALTER TABLE prod_batches ADD COLUMN IF NOT EXISTS input_weight_kg NUMERIC(12,3)"
        ))
        await conn.execute(text(
            "ALTER TABLE prod_batches ADD COLUMN IF NOT EXISTS inv_stock_doc_id INTEGER REFERENCES inv_stock_docs(id) ON DELETE SET NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE cooking_logs ADD COLUMN IF NOT EXISTS prod_batch_id INTEGER REFERENCES prod_batches(id) ON DELETE SET NULL"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_cooking_logs_prod_batch_id ON cooking_logs(prod_batch_id) WHERE prod_batch_id IS NOT NULL"
        ))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS prod_forming_trolleys (
                id SERIAL PRIMARY KEY,
                batch_id INTEGER NOT NULL REFERENCES prod_batches(id) ON DELETE CASCADE,
                trolley_no VARCHAR(20) NOT NULL,
                sampled_tray_count INTEGER NOT NULL,
                sampled_gross_weight_sum_kg NUMERIC(10,3) NOT NULL,
                tray_tare_weight_kg NUMERIC(8,3) NOT NULL,
                total_trays_on_trolley INTEGER NOT NULL,
                partial_trays_count INTEGER NOT NULL DEFAULT 0,
                partial_fill_ratio NUMERIC(4,2) NOT NULL DEFAULT 0.5,
                avg_tray_net_weight_kg NUMERIC(10,4),
                equivalent_tray_count NUMERIC(10,2),
                estimated_net_weight_kg NUMERIC(12,3),
                remark TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS prod_packing_records (
                id SERIAL PRIMARY KEY,
                batch_id INTEGER NOT NULL REFERENCES prod_batches(id) ON DELETE CASCADE,
                pack_type prod_pack_type_enum NOT NULL,
                product_id INTEGER REFERENCES prod_products(id),
                bag_count INTEGER NOT NULL,
                nominal_weight_kg NUMERIC(8,3) NOT NULL,
                theoretical_total_weight_kg NUMERIC(12,3),
                remark TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS prod_packing_trim (
                id SERIAL PRIMARY KEY,
                batch_id INTEGER NOT NULL REFERENCES prod_batches(id) ON DELETE CASCADE,
                trim_type VARCHAR(100) NOT NULL,
                weight_kg NUMERIC(10,3) NOT NULL,
                remark TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS prod_repack_jobs (
                id SERIAL PRIMARY KEY,
                new_batch_code VARCHAR(50) NOT NULL,
                date DATE NOT NULL,
                operator VARCHAR(100),
                remark TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS prod_repack_inputs (
                id SERIAL PRIMARY KEY,
                repack_job_id INTEGER NOT NULL REFERENCES prod_repack_jobs(id) ON DELETE CASCADE,
                from_batch_id INTEGER REFERENCES prod_batches(id),
                product_id INTEGER REFERENCES prod_products(id),
                bag_count INTEGER NOT NULL,
                nominal_weight_kg NUMERIC(8,3) NOT NULL,
                total_weight_kg NUMERIC(12,3),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS prod_repack_outputs (
                id SERIAL PRIMARY KEY,
                repack_job_id INTEGER NOT NULL REFERENCES prod_repack_jobs(id) ON DELETE CASCADE,
                pack_type prod_pack_type_enum NOT NULL,
                product_id INTEGER REFERENCES prod_products(id),
                bag_count INTEGER NOT NULL,
                nominal_weight_kg NUMERIC(8,3) NOT NULL,
                total_weight_kg NUMERIC(12,3),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS prod_repack_trim (
                id SERIAL PRIMARY KEY,
                repack_job_id INTEGER NOT NULL REFERENCES prod_repack_jobs(id) ON DELETE CASCADE,
                trim_type VARCHAR(100) NOT NULL,
                weight_kg NUMERIC(10,3) NOT NULL,
                remark TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        # Seed production products (forming)
        await conn.execute(text("""
            INSERT INTO prod_products (code, name, pack_size_kg, product_type, is_active)
            SELECT v.code, v.name, v.pack_size_kg, 'forming', TRUE
            FROM (VALUES
                ('DC-PC-BASE', '餃子皮+餡料基礎', NULL::NUMERIC),
                ('DC-PC-SEMIFIN-4KG', '4kg半成品袋', 4.0),
                ('DC-PC-FG-1KG', '1kg成品', 1.0),
                ('DC-PC-FG-0.5KG', '0.5kg成品', 0.5)
            ) AS v(code, name, pack_size_kg)
            WHERE NOT EXISTS (SELECT 1 FROM prod_products WHERE prod_products.code = v.code)
        """))
        # Seed inventory items for hot-process products
        await conn.execute(text("""
            INSERT INTO inv_items (code, name, category, base_unit)
            SELECT v.code, v.name, '熱加工', 'KG'
            FROM (VALUES
                ('HP-PD', '豬肚'),
                ('HP-CC', '雞肉塊'),
                ('HP-BC', '牛肉粒'),
                ('HP-SB', '牛湯骨'),
                ('HP-FI', '肥腸')
            ) AS v(code, name)
            WHERE NOT EXISTS (SELECT 1 FROM inv_items WHERE inv_items.code = v.code)
        """))
        # Seed production products (hot-process) linked to inventory items
        await conn.execute(text("""
            INSERT INTO prod_products (code, name, product_type, inv_item_id, is_active)
            SELECT v.code, v.name, 'hot_process', (SELECT id FROM inv_items WHERE code = v.item_code), TRUE
            FROM (VALUES
                ('PD', '豬肚',   'HP-PD'),
                ('CC', '雞肉塊', 'HP-CC'),
                ('BC', '牛肉粒', 'HP-BC'),
                ('SB', '牛湯骨', 'HP-SB'),
                ('FI', '肥腸',   'HP-FI')
            ) AS v(code, name, item_code)
            WHERE NOT EXISTS (SELECT 1 FROM prod_products WHERE prod_products.code = v.code)
        """))
        # Seed HACCP products for hot-process items (needed for cooking log CCP monitoring)
        await conn.execute(text("""
            INSERT INTO products (name, ccp_limit_temp, is_active)
            SELECT v.name, 75.00, TRUE
            FROM (VALUES
                ('豬肚'), ('雞肉塊'), ('牛肉粒'), ('牛湯骨'), ('肥腸')
            ) AS v(name)
            WHERE NOT EXISTS (SELECT 1 FROM products WHERE products.name = v.name)
        """))
    yield
    # Shutdown: Close database connections
    await engine.dispose()


app = FastAPI(
    title="FD Catering HACCP eQMS System",
    description="Electronic Quality Management System for HACCP Compliance — ALCOA+ compliant",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Register all routers under /api/v1
# ---------------------------------------------------------------------------

# Auth
app.include_router(auth.router, prefix="/api/v1")

# Reference tables
app.include_router(users.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(suppliers.router, prefix="/api/v1")
app.include_router(equipment.router, prefix="/api/v1")
app.include_router(areas.router, prefix="/api/v1")

# HACCP log tables
app.include_router(cooking_logs.router, prefix="/api/v1")
app.include_router(receiving_logs.router, prefix="/api/v1")
app.include_router(cooling_logs.router, prefix="/api/v1")
app.include_router(sanitising_logs.router, prefix="/api/v1")
app.include_router(assembly_packing_logs.router, prefix="/api/v1")
app.include_router(deviation_logs.router, prefix="/api/v1")

# Inventory module
app.include_router(inventory_items.router, prefix="/api/v1")
app.include_router(inventory_locations.router, prefix="/api/v1")
app.include_router(inventory_docs.router, prefix="/api/v1")
app.include_router(inventory_balance.router, prefix="/api/v1")

# Production module
app.include_router(production_products.router, prefix="/api/v1")
app.include_router(production_pack_types.router, prefix="/api/v1")
app.include_router(production_batches.router, prefix="/api/v1")
app.include_router(production_repack.router, prefix="/api/v1")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "FD Catering HACCP eQMS System API",
        "version": "2.0.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
