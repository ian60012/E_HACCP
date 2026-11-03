"""Central authorization and release rules for production quality control."""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.models.quality_control import (
    ProdBatchQualityInspection,
    QualityControlSetting,
    QualityRolePermission,
)


def role_value(user) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


async def permissions_for(db, user) -> dict[str, bool]:
    role = role_value(user)
    if role in ("Admin", "Captain"):
        return {"can_view": True, "can_edit": True, "can_verify": True}
    row = await db.get(QualityRolePermission, role)
    if not row:
        return {"can_view": False, "can_edit": False, "can_verify": False}
    return {
        "can_view": bool(row.can_view),
        "can_edit": bool(row.can_edit),
        "can_verify": bool(row.can_verify),
    }


async def require_permission(db, user, action: str) -> dict[str, bool]:
    permissions = await permissions_for(db, user)
    key = f"can_{action}"
    if not permissions.get(key, False):
        raise HTTPException(403, f"Quality control permission '{action}' is required")
    return permissions


async def latest_inspection(db, batch_id: int) -> ProdBatchQualityInspection | None:
    return await db.scalar(
        select(ProdBatchQualityInspection)
        .where(ProdBatchQualityInspection.batch_id == batch_id)
        .order_by(ProdBatchQualityInspection.revision.desc())
        .limit(1)
    )


async def release_required(db, batch) -> bool:
    setting = await db.get(QualityControlSetting, 1)
    if not setting:
        return True
    created_at = batch.created_at
    started_at = setting.enforcement_started_at
    if created_at.tzinfo is None and started_at.tzinfo is not None:
        created_at = created_at.replace(tzinfo=started_at.tzinfo)
    return created_at >= started_at


async def ensure_released_for_stock(db, batch) -> None:
    if not await release_required(db, batch):
        return
    inspection = await latest_inspection(db, batch.id)
    if not inspection or inspection.status != "approved":
        raise HTTPException(
            409,
            "此批次须先完成品质检验并由品管签核放行 Quality inspection and QA release are required before stock entry",
        )


def validate_for_verification(record: ProdBatchQualityInspection) -> str:
    results = [record.color_result, record.aroma_result, record.taste_result]
    if any(result not in ("pass", "fail", "not_applicable") for result in results):
        raise HTTPException(422, "色、香、味三项结果必须完整填写 All sensory results are required")
    if "not_applicable" in results and not (record.not_applicable_reason or "").strip():
        raise HTTPException(422, "选择不适用时必须填写原因 A reason is required for not applicable")
    if "fail" in results and not (record.corrective_action or "").strip():
        raise HTTPException(422, "不合格时必须填写纠正措施 Corrective action is required for a failed result")
    if record.inspection_at is None:
        raise HTTPException(422, "检验时间不能为空 Inspection time is required")
    if record.retained_sample is None:
        raise HTTPException(422, "请选择是否留样 Retained-sample selection is required")
    if record.retained_sample:
        required = (
            record.sample_code,
            record.sample_quantity,
            record.sample_unit,
            record.sampled_at,
            record.storage_condition,
            record.storage_location,
            record.disposal_due_date,
        )
        if any(value is None or (isinstance(value, str) and not value.strip()) for value in required):
            raise HTTPException(422, "留样资料必须完整填写 All retained-sample fields are required")
    elif not (record.no_sample_reason or "").strip():
        raise HTTPException(422, "未留样时必须填写原因 A reason is required when no sample is retained")
    return "rejected" if "fail" in results else "approved"
