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
