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
from app.routers.api.v1 import suppliers
from app.routers.api.v1 import equipment
from app.routers.api.v1 import areas
from app.routers.api.v1 import cooking_logs
from app.routers.api.v1 import receiving_logs
from app.routers.api.v1 import cooling_logs
from app.routers.api.v1 import sanitising_logs
from app.routers.api.v1 import deviation_logs
from app.routers.api.v1 import ppe_compliance_logs
from app.routers.api.v1 import mixing_logs
from app.routers.api.v1 import inventory_items
from app.routers.api.v1 import inventory_locations
from app.routers.api.v1 import inventory_docs
from app.routers.api.v1 import inventory_balance
from app.routers.api.v1 import production_products
from app.routers.api.v1 import production_pack_types
from app.routers.api.v1 import production_batches
from app.routers.api.v1 import production_repack
from app.routers.api.v1 import assembly_packing_logs
from app.routers.api.v1 import inventory_stocktake
from app.routers.api.v1 import batch_sheets


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
        # Note: prod_pack_type_enum removed — pack_type is now VARCHAR(50)
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
                pack_type VARCHAR(50) NOT NULL,
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
                pack_type VARCHAR(50) NOT NULL,
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
        # ----- Assembly packing logs -----
        # Drop old table if it has old schema (product_id column), then recreate
        await conn.execute(text("""
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'assembly_packing_logs' AND column_name = 'product_id'
                ) THEN
                    DROP TABLE assembly_packing_logs CASCADE;
                END IF;
            END $$
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS assembly_packing_logs (
                id                   SERIAL PRIMARY KEY,
                prod_batch_id        INTEGER NOT NULL REFERENCES prod_batches(id) ON DELETE CASCADE,
                is_allergen_declared BOOLEAN NOT NULL,
                is_date_code_correct BOOLEAN,
                label_photo_path     VARCHAR(500),
                target_weight_g      NUMERIC(8,2),
                sample_1_g           NUMERIC(8,2),
                sample_2_g           NUMERIC(8,2),
                sample_3_g           NUMERIC(8,2),
                sample_4_g           NUMERIC(8,2),
                sample_5_g           NUMERIC(8,2),
                average_weight_g     NUMERIC(8,2) GENERATED ALWAYS AS (
                    CASE WHEN sample_1_g IS NOT NULL AND sample_2_g IS NOT NULL
                         AND sample_3_g IS NOT NULL AND sample_4_g IS NOT NULL
                         AND sample_5_g IS NOT NULL
                    THEN (sample_1_g+sample_2_g+sample_3_g+sample_4_g+sample_5_g)/5.0
                    ELSE NULL END
                ) STORED,
                seal_integrity       pass_fail_enum,
                coding_legibility    pass_fail_enum,
                corrective_action    TEXT,
                notes                TEXT,
                operator_id          INTEGER NOT NULL REFERENCES users(id),
                verified_by          INTEGER REFERENCES users(id),
                is_locked            BOOLEAN NOT NULL DEFAULT FALSE,
                is_voided            BOOLEAN NOT NULL DEFAULT FALSE,
                void_reason          TEXT,
                voided_at            TIMESTAMPTZ,
                voided_by            INTEGER REFERENCES users(id),
                created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        # ALCOA+ triggers for assembly_packing_logs
        await conn.execute(text("""
            CREATE OR REPLACE TRIGGER trg_prevent_delete_assembly_packing_logs
                BEFORE DELETE ON assembly_packing_logs FOR EACH ROW
                EXECUTE FUNCTION prevent_log_delete()
        """))
        await conn.execute(text("""
            CREATE OR REPLACE TRIGGER trg_prevent_locked_mod_assembly_packing_logs
                BEFORE UPDATE ON assembly_packing_logs FOR EACH ROW
                EXECUTE FUNCTION prevent_locked_modification()
        """))
        # cooling_logs: add prod_batch_id FK
        await conn.execute(text(
            "ALTER TABLE cooling_logs ADD COLUMN IF NOT EXISTS "
            "prod_batch_id INTEGER REFERENCES prod_batches(id) ON DELETE SET NULL"
        ))
        # prod_hot_inputs: multiple input entries per hot-process batch
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS prod_hot_inputs (
                id            SERIAL PRIMARY KEY,
                prod_batch_id INTEGER NOT NULL REFERENCES prod_batches(id) ON DELETE CASCADE,
                seq           INTEGER NOT NULL,
                weight_kg     NUMERIC(12,3) NOT NULL CHECK (weight_kg > 0),
                notes         TEXT,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_hot_input_batch_seq UNIQUE (prod_batch_id, seq)
            )
        """))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_prod_hot_inputs_batch ON prod_hot_inputs(prod_batch_id)"
        ))
        # Link cooking/cooling logs to a specific hot input entry
        await conn.execute(text(
            "ALTER TABLE cooking_logs ADD COLUMN IF NOT EXISTS "
            "hot_input_id INTEGER REFERENCES prod_hot_inputs(id) ON DELETE SET NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE cooling_logs ADD COLUMN IF NOT EXISTS "
            "hot_input_id INTEGER REFERENCES prod_hot_inputs(id) ON DELETE SET NULL"
        ))
        # ----- Stocktake module -----
        await conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE inv_stocktake_status_enum AS ENUM ('draft', 'confirmed');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS inv_stocktakes (
                id              SERIAL PRIMARY KEY,
                doc_number      VARCHAR(30) UNIQUE NOT NULL,
                status          inv_stocktake_status_enum NOT NULL DEFAULT 'draft',
                location_id     INTEGER NOT NULL REFERENCES inv_locations(id),
                count_date      DATE NOT NULL,
                notes           TEXT,
                operator_id     INTEGER REFERENCES users(id),
                confirmed_at    TIMESTAMPTZ,
                adj_in_doc_id   INTEGER REFERENCES inv_stock_docs(id) ON DELETE SET NULL,
                adj_out_doc_id  INTEGER REFERENCES inv_stock_docs(id) ON DELETE SET NULL,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS inv_stocktake_lines (
                id              SERIAL PRIMARY KEY,
                stocktake_id    INTEGER NOT NULL REFERENCES inv_stocktakes(id) ON DELETE CASCADE,
                item_id         INTEGER NOT NULL REFERENCES inv_items(id),
                location_id     INTEGER NOT NULL REFERENCES inv_locations(id),
                system_qty      NUMERIC(12,3) NOT NULL DEFAULT 0,
                physical_qty    NUMERIC(12,3),
                notes           TEXT,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        # Daily Batch Sheet (FSP-LOG-017)
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS prod_daily_batch_sheets (
                id            SERIAL PRIMARY KEY,
                batch_id      INTEGER NOT NULL UNIQUE REFERENCES prod_batches(id) ON DELETE CASCADE,
                operator_id   INTEGER REFERENCES users(id),
                operator_name VARCHAR(100),
                verified_by   INTEGER REFERENCES users(id),
                verified_at   TIMESTAMPTZ,
                is_locked     BOOLEAN NOT NULL DEFAULT FALSE,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS prod_batch_sheet_lines (
                id                SERIAL PRIMARY KEY,
                sheet_id          INTEGER NOT NULL REFERENCES prod_daily_batch_sheets(id) ON DELETE CASCADE,
                inv_item_id       INTEGER REFERENCES inv_items(id) ON DELETE SET NULL,
                ingredient_name   VARCHAR(200) NOT NULL,
                receiving_log_id  INTEGER REFERENCES receiving_logs(id) ON DELETE SET NULL,
                is_used           BOOLEAN NOT NULL DEFAULT FALSE,
                supplier          VARCHAR(200),
                supplier_batch_no VARCHAR(100),
                qty_used          NUMERIC(12,3),
                unit              VARCHAR(20),
                seq               INTEGER NOT NULL DEFAULT 0
            )
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
app.include_router(suppliers.router, prefix="/api/v1")
app.include_router(equipment.router, prefix="/api/v1")
app.include_router(areas.router, prefix="/api/v1")

# HACCP log tables
app.include_router(cooking_logs.router, prefix="/api/v1")
app.include_router(receiving_logs.router, prefix="/api/v1")
app.include_router(cooling_logs.router, prefix="/api/v1")
app.include_router(sanitising_logs.router, prefix="/api/v1")
app.include_router(deviation_logs.router, prefix="/api/v1")
app.include_router(ppe_compliance_logs.router, prefix="/api/v1")
app.include_router(mixing_logs.router, prefix="/api/v1")

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

# Assembly & Packing logs (forming batch food safety)
app.include_router(assembly_packing_logs.router, prefix="/api/v1")

# Inventory stocktake (盤點)
app.include_router(inventory_stocktake.router, prefix="/api/v1")

# Daily Batch Sheet (FSP-LOG-017)
app.include_router(batch_sheets.router, prefix="/api/v1")


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
