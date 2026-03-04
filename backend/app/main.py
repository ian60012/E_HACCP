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
