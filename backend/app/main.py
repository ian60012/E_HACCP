from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base
from app.routers.api.v1 import cooking_logs


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup: Initialize database
    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown: Close database connections
    await engine.dispose()


app = FastAPI(
    title="FD Catering HACCP eQMS System",
    description="Electronic Quality Management System for HACCP Compliance",
    version="1.0.0",
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

# Include routers
app.include_router(cooking_logs.router, prefix="/api/v1", tags=["cooking-logs"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "FD Catering HACCP eQMS System API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}
