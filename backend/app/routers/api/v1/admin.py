"""
Admin-only endpoints.

GET /admin/activity — Unified activity log across all HACCP modules
"""

from datetime import date, datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import get_db
from app.models.user import User
from app.dependencies.auth import require_role

router = APIRouter(prefix="/admin", tags=["admin"])


class ActivityItem(BaseModel):
    module: str
    record_id: int
    summary: Optional[str]
    operator_name: Optional[str]
    created_at: datetime
    is_locked: bool
    is_voided: bool


class ActivityResponse(BaseModel):
    items: List[ActivityItem]
    total: int
    skip: int
    limit: int


_UNION_SQL = """
SELECT module, record_id, summary, operator_name, created_at, is_locked, is_voided FROM (

    SELECT 'cooking'   AS module, cl.id AS record_id, cl.batch_id AS summary,
           u.full_name AS operator_name, cl.created_at, cl.is_locked, cl.is_voided
    FROM cooking_logs cl LEFT JOIN users u ON cl.operator_id = u.id

    UNION ALL

    SELECT 'mixing', ml.id, ml.batch_id, u.full_name, ml.created_at, ml.is_locked, ml.is_voided
    FROM mixing_logs ml LEFT JOIN users u ON ml.operator_id = u.id

    UNION ALL

    SELECT 'cooling', col.id, col.batch_id, u.full_name, col.created_at, col.is_locked, col.is_voided
    FROM cooling_logs col LEFT JOIN users u ON col.operator_id = u.id

    UNION ALL

    SELECT 'receiving', rl.id, rl.product_name, u.full_name, rl.created_at, rl.is_locked, rl.is_voided
    FROM receiving_logs rl LEFT JOIN users u ON rl.operator_id = u.id

    UNION ALL

    SELECT 'sanitising', sl.id, LEFT(sl.target_description, 60), u.full_name,
           sl.created_at, sl.is_locked, sl.is_voided
    FROM sanitising_logs sl LEFT JOIN users u ON sl.operator_id = u.id

    UNION ALL

    SELECT 'deviation', dl.id, LEFT(dl.description, 60), u.full_name,
           dl.created_at, dl.is_locked, dl.is_voided
    FROM deviation_logs dl LEFT JOIN users u ON dl.operator_id = u.id

    UNION ALL

    SELECT 'ppe', pl.id, pl.check_date::text, u.full_name,
           pl.created_at, pl.is_locked, pl.is_voided
    FROM ppe_compliance_logs pl LEFT JOIN users u ON pl.operator_id = u.id

    UNION ALL

    SELECT 'assembly', al.id, pb_a.batch_code, u.full_name,
           al.created_at, al.is_locked, al.is_voided
    FROM assembly_packing_logs al
    LEFT JOIN users u  ON al.operator_id = u.id
    LEFT JOIN prod_batches pb_a ON pb_a.id = al.prod_batch_id

    UNION ALL

    SELECT 'batch', pb.id, pb.batch_code || ' · ' || pb.product_name,
           pb.operator, pb.created_at, FALSE, pb.is_voided
    FROM prod_batches pb

    UNION ALL

    SELECT 'batch_sheet', pbs.id, pb2.batch_code,
           pbs.operator_name, pbs.created_at, pbs.is_locked, FALSE
    FROM prod_daily_batch_sheets pbs
    JOIN prod_batches pb2 ON pb2.id = pbs.batch_id

) AS activity
WHERE 1=1
{filters}
ORDER BY created_at DESC
"""


@router.get("/activity", response_model=ActivityResponse)
async def get_activity(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    operator_name: Optional[str] = Query(None, description="Filter by operator name (partial match)"),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    module: Optional[str] = Query(None, description="Filter by module (cooking/receiving/mixing/...)"),
    current_user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    """Unified activity log across all HACCP modules. Admin only."""
    filter_clauses = []
    params: dict = {}

    if operator_name:
        filter_clauses.append("AND LOWER(operator_name) LIKE :operator_name")
        params["operator_name"] = f"%{operator_name.lower()}%"
    if date_from:
        filter_clauses.append("AND created_at >= :date_from")
        params["date_from"] = datetime(date_from.year, date_from.month, date_from.day)
    if date_to:
        filter_clauses.append("AND created_at < :date_to")
        params["date_to"] = datetime(date_to.year, date_to.month, date_to.day + 1)
    if module:
        filter_clauses.append("AND module = :module")
        params["module"] = module

    filters = " ".join(filter_clauses)
    base_sql = _UNION_SQL.format(filters=filters)

    # Count
    count_sql = f"SELECT COUNT(*) FROM ({base_sql.replace('ORDER BY created_at DESC', '')}) AS cnt"
    total_result = await db.execute(text(count_sql), params)
    total = total_result.scalar() or 0

    # Paginated results
    paged_sql = base_sql + " LIMIT :limit OFFSET :skip"
    params["limit"] = limit
    params["skip"] = skip
    rows = await db.execute(text(paged_sql), params)

    items = [
        ActivityItem(
            module=row.module,
            record_id=row.record_id,
            summary=row.summary,
            operator_name=row.operator_name,
            created_at=row.created_at,
            is_locked=bool(row.is_locked),
            is_voided=bool(row.is_voided),
        )
        for row in rows.all()
    ]

    return ActivityResponse(items=items, total=total, skip=skip, limit=limit)
