"""Production repack router (改包作業)."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.production import (
    ProdRepackJob,
    ProdRepackInput,
    ProdRepackOutput,
    ProdRepackTrim,
    ProdBatch,
    ProdProduct,
)
from app.models.user import User
from app.schemas.production import (
    ProdRepackJobCreate,
    ProdRepackJobResponse,
    ProdRepackInputCreate,
    ProdRepackInputResponse,
    ProdRepackOutputCreate,
    ProdRepackOutputResponse,
    ProdRepackTrimCreate,
    ProdRepackTrimResponse,
    RepackTotalsResponse,
)
from app.schemas.common import PaginatedResponse
from app.dependencies.auth import get_current_active_user, require_role
from app.services.production_service import (
    generate_repack_batch_code,
    calculate_repack_totals,
)

router = APIRouter(prefix="/production/repack", tags=["Production Repack"])


def _input_response(inp: ProdRepackInput) -> ProdRepackInputResponse:
    return ProdRepackInputResponse(
        id=inp.id,
        repack_job_id=inp.repack_job_id,
        from_batch_id=inp.from_batch_id,
        from_batch_code=inp.batch.batch_code if inp.batch else None,
        product_id=inp.product_id,
        product_name=inp.product.name if inp.product else None,
        bag_count=inp.bag_count,
        nominal_weight_kg=inp.nominal_weight_kg,
        total_weight_kg=inp.total_weight_kg,
    )


def _output_response(out: ProdRepackOutput) -> ProdRepackOutputResponse:
    return ProdRepackOutputResponse(
        id=out.id,
        repack_job_id=out.repack_job_id,
        pack_type=out.pack_type.value if hasattr(out.pack_type, "value") else out.pack_type,
        product_id=out.product_id,
        product_name=out.product.name if out.product else None,
        bag_count=out.bag_count,
        nominal_weight_kg=out.nominal_weight_kg,
        total_weight_kg=out.total_weight_kg,
    )


def _trim_response(t: ProdRepackTrim) -> ProdRepackTrimResponse:
    return ProdRepackTrimResponse(
        id=t.id,
        repack_job_id=t.repack_job_id,
        trim_type=t.trim_type,
        weight_kg=t.weight_kg,
        remark=t.remark,
    )


def _to_response(job: ProdRepackJob) -> ProdRepackJobResponse:
    return ProdRepackJobResponse(
        id=job.id,
        new_batch_code=job.new_batch_code,
        date=job.date,
        operator=job.operator,
        remark=job.remark,
        created_at=job.created_at,
        inputs=[_input_response(i) for i in (job.inputs or [])],
        outputs=[_output_response(o) for o in (job.outputs or [])],
        trims=[_trim_response(t) for t in (job.trims or [])],
    )


def _base_query():
    return select(ProdRepackJob).options(
        selectinload(ProdRepackJob.inputs).selectinload(ProdRepackInput.batch),
        selectinload(ProdRepackJob.inputs).selectinload(ProdRepackInput.product),
        selectinload(ProdRepackJob.outputs).selectinload(ProdRepackOutput.product),
        selectinload(ProdRepackJob.trims),
    )


@router.get("", response_model=PaginatedResponse[ProdRepackJobResponse])
async def list_repack_jobs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    q = _base_query()
    filters = []
    if date_from:
        q = q.where(ProdRepackJob.date >= date_from)
        filters.append(ProdRepackJob.date >= date_from)
    if date_to:
        q = q.where(ProdRepackJob.date <= date_to)
        filters.append(ProdRepackJob.date <= date_to)

    count_q = select(func.count()).select_from(
        select(ProdRepackJob).where(*filters).subquery()
    )
    total_result = await db.execute(count_q)
    total = total_result.scalar()

    jobs_result = await db.execute(
        q.order_by(ProdRepackJob.created_at.desc()).offset(skip).limit(limit)
    )
    jobs = jobs_result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(j) for j in jobs],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post(
    "", response_model=ProdRepackJobResponse, status_code=status.HTTP_201_CREATED
)
async def create_repack_job(
    data: ProdRepackJobCreate,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    new_batch_code = await generate_repack_batch_code(db, data.date)
    job = ProdRepackJob(
        new_batch_code=new_batch_code,
        date=data.date,
        operator=data.operator,
        remark=data.remark,
    )
    db.add(job)
    await db.flush()
    await db.commit()

    result = await db.execute(_base_query().where(ProdRepackJob.id == job.id))
    return _to_response(result.scalar_one())


@router.get("/{job_id}", response_model=ProdRepackJobResponse)
async def get_repack_job(
    job_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(_base_query().where(ProdRepackJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repack job not found"
        )
    return _to_response(job)


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------


@router.post(
    "/{job_id}/inputs",
    response_model=ProdRepackInputResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_input(
    job_id: int,
    data: ProdRepackInputCreate,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(ProdRepackJob, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repack job not found"
        )

    inp = ProdRepackInput(
        repack_job_id=job_id,
        from_batch_id=data.from_batch_id,
        product_id=data.product_id,
        bag_count=data.bag_count,
        nominal_weight_kg=data.nominal_weight_kg,
        total_weight_kg=data.bag_count * data.nominal_weight_kg,
    )
    db.add(inp)
    await db.flush()
    await db.commit()
    await db.refresh(inp)

    # Eagerly load relationships for response
    result = await db.execute(
        select(ProdRepackInput)
        .options(
            selectinload(ProdRepackInput.batch),
            selectinload(ProdRepackInput.product),
        )
        .where(ProdRepackInput.id == inp.id)
    )
    return _input_response(result.scalar_one())


@router.delete(
    "/{job_id}/inputs/{input_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_input(
    job_id: int,
    input_id: int,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProdRepackInput).where(
            ProdRepackInput.id == input_id,
            ProdRepackInput.repack_job_id == job_id,
        )
    )
    inp = result.scalar_one_or_none()
    if not inp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repack input not found"
        )
    await db.delete(inp)
    await db.flush()
    await db.commit()


# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------


@router.post(
    "/{job_id}/outputs",
    response_model=ProdRepackOutputResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_output(
    job_id: int,
    data: ProdRepackOutputCreate,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(ProdRepackJob, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repack job not found"
        )

    out = ProdRepackOutput(
        repack_job_id=job_id,
        pack_type=data.pack_type,
        product_id=data.product_id,
        bag_count=data.bag_count,
        nominal_weight_kg=data.nominal_weight_kg,
        total_weight_kg=data.bag_count * data.nominal_weight_kg,
    )
    db.add(out)
    await db.flush()
    await db.commit()
    await db.refresh(out)

    # Eagerly load product for response
    result = await db.execute(
        select(ProdRepackOutput)
        .options(selectinload(ProdRepackOutput.product))
        .where(ProdRepackOutput.id == out.id)
    )
    return _output_response(result.scalar_one())


@router.delete(
    "/{job_id}/outputs/{output_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_output(
    job_id: int,
    output_id: int,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProdRepackOutput).where(
            ProdRepackOutput.id == output_id,
            ProdRepackOutput.repack_job_id == job_id,
        )
    )
    out = result.scalar_one_or_none()
    if not out:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repack output not found"
        )
    await db.delete(out)
    await db.flush()
    await db.commit()


# ---------------------------------------------------------------------------
# Trims
# ---------------------------------------------------------------------------


@router.post(
    "/{job_id}/trims",
    response_model=ProdRepackTrimResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_trim(
    job_id: int,
    data: ProdRepackTrimCreate,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(ProdRepackJob, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repack job not found"
        )

    trim = ProdRepackTrim(
        repack_job_id=job_id,
        trim_type=data.trim_type,
        weight_kg=data.weight_kg,
        remark=data.remark,
    )
    db.add(trim)
    await db.flush()
    await db.commit()
    await db.refresh(trim)

    return _trim_response(trim)


@router.delete(
    "/{job_id}/trims/{trim_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_trim(
    job_id: int,
    trim_id: int,
    current_user: User = Depends(require_role("Admin", "Production")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProdRepackTrim).where(
            ProdRepackTrim.id == trim_id,
            ProdRepackTrim.repack_job_id == job_id,
        )
    )
    trim = result.scalar_one_or_none()
    if not trim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repack trim not found"
        )
    await db.delete(trim)
    await db.flush()
    await db.commit()


# ---------------------------------------------------------------------------
# Totals
# ---------------------------------------------------------------------------


@router.get("/{job_id}/totals", response_model=RepackTotalsResponse)
async def get_repack_totals(
    job_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify job exists
    job = await db.get(ProdRepackJob, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repack job not found"
        )
    totals = await calculate_repack_totals(db, job_id)
    return RepackTotalsResponse(**totals)
