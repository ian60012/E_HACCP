"""Batch sensory quality inspection, retained samples, photos, and permissions."""

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.dependencies.auth import get_current_active_user, require_role
from app.models.production import ProdBatch
from app.models.quality_control import (
    ProdBatchQualityInspection,
    QualityControlSetting,
    QualityRolePermission,
)
from app.models.user import User
from app.schemas.quality_control import (
    QualityInspectionContext,
    QualityInspectionResponse,
    QualityInspectionSave,
    QualityInspectionVerify,
    QualityPermissionFlags,
    QualityPermissionsConfig,
    QualityPermissionsUpdate,
    QualityRolePermissionResponse,
)
from app.services.audit_service import create_audit_entry
from app.services.quality_control import (
    latest_inspection,
    permissions_for,
    release_required,
    require_permission,
    validate_for_verification,
)

router = APIRouter(prefix="/production/batches", tags=["Production Quality Control"])
permissions_router = APIRouter(prefix="/quality-control/permissions", tags=["Production Quality Control"])

MAX_PHOTO_BYTES = 5 * 1024 * 1024
PHOTO_TYPES = {
    "image/jpeg": (b"\xff\xd8\xff", ".jpg"),
    "image/png": (b"\x89PNG\r\n\x1a\n", ".png"),
    "image/webp": (b"RIFF", ".webp"),
}


async def _batch_or_404(db: AsyncSession, batch_id: int) -> ProdBatch:
    batch = await db.get(ProdBatch, batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found")
    return batch


def _photo_dir() -> Path:
    path = Path(settings.QUALITY_PHOTO_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _response(record: ProdBatchQualityInspection) -> QualityInspectionResponse:
    return QualityInspectionResponse(
        id=record.id,
        batch_id=record.batch_id,
        revision=record.revision,
        status=record.status,
        inspection_at=record.inspection_at,
        color_result=record.color_result,
        aroma_result=record.aroma_result,
        taste_result=record.taste_result,
        not_applicable_reason=record.not_applicable_reason,
        notes=record.notes,
        corrective_action=record.corrective_action,
        retained_sample=record.retained_sample,
        no_sample_reason=record.no_sample_reason,
        sample_code=record.sample_code,
        sample_quantity=record.sample_quantity,
        sample_unit=record.sample_unit,
        sampled_at=record.sampled_at,
        storage_condition=record.storage_condition,
        storage_location=record.storage_location,
        disposal_due_date=record.disposal_due_date,
        has_photo=bool(record.photo_stored_name),
        photo_original_name=record.photo_original_name,
        photo_content_type=record.photo_content_type,
        photo_size_bytes=record.photo_size_bytes,
        photo_uploaded_at=record.photo_uploaded_at,
        created_by=record.created_by,
        created_by_name=record.creator.full_name if record.creator else None,
        created_at=record.created_at,
        updated_by=record.updated_by,
        updated_by_name=record.updater.full_name if record.updater else None,
        updated_at=record.updated_at,
        verified_by=record.verified_by,
        verifier_name=record.verifier.full_name if record.verifier else None,
        verified_at=record.verified_at,
        verifier_signature_data_url=record.verifier_signature_data_url,
    )


def _inspection_query(record_id: int):
    return (
        select(ProdBatchQualityInspection)
        .where(ProdBatchQualityInspection.id == record_id)
        .options(
            selectinload(ProdBatchQualityInspection.creator),
            selectinload(ProdBatchQualityInspection.updater),
            selectinload(ProdBatchQualityInspection.verifier),
        )
    )


async def _reload(db: AsyncSession, record_id: int) -> ProdBatchQualityInspection:
    return (await db.execute(_inspection_query(record_id))).scalar_one()


@router.get("/{batch_id}/quality-inspection", response_model=QualityInspectionContext)
async def get_quality_inspection(
    batch_id: int,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    permission = await require_permission(db, user, "view")
    batch = await _batch_or_404(db, batch_id)
    record = await latest_inspection(db, batch_id)
    if record:
        record = await _reload(db, record.id)
    return QualityInspectionContext(
        batch_id=batch.id,
        batch_code=batch.batch_code,
        product_name=batch.product_name,
        production_date=batch.production_date,
        process_type=batch.process_type,
        is_voided=batch.is_voided,
        release_required=await release_required(db, batch),
        permissions=QualityPermissionFlags(**permission),
        inspection=_response(record) if record else None,
    )


@router.post("/{batch_id}/quality-inspection", response_model=QualityInspectionResponse)
async def save_quality_inspection(
    batch_id: int,
    data: QualityInspectionSave,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, user, "edit")
    batch = await _batch_or_404(db, batch_id)
    if batch.is_voided:
        raise HTTPException(409, "Voided batches cannot be inspected")
    record = await latest_inspection(db, batch_id)
    if record and record.status != "draft":
        raise HTTPException(409, "Signed inspection is locked; create a corrective revision")
    now = datetime.now(timezone.utc)
    if not record:
        record = ProdBatchQualityInspection(
            batch_id=batch_id,
            revision=1,
            status="draft",
            created_by=user.id,
            updated_by=user.id,
            updated_at=now,
        )
        db.add(record)
        await db.flush()
        action = "CREATE"
    else:
        record.updated_by = user.id
        record.updated_at = now
        action = "UPDATE"
    fields = data.model_dump(exclude_unset=True)
    for name, value in fields.items():
        setattr(record, name, value)
    if record.retained_sample and not (record.sample_code or "").strip():
        record.sample_code = f"{batch.batch_code}-S{record.revision}"
    if data.retained_sample is False:
        for name in ("sample_code", "sample_quantity", "sample_unit", "sampled_at", "storage_condition", "storage_location", "disposal_due_date"):
            setattr(record, name, None)
    elif data.retained_sample is True:
        record.no_sample_reason = None
    await create_audit_entry(
        db=db,
        table_name="prod_batch_quality_inspections",
        record_id=record.id,
        action=action,
        changed_by=user.id,
        changed_fields=sorted(fields.keys()),
        new_values={"batch_id": batch_id, "revision": record.revision, "status": record.status},
        reason=f"Batch quality inspection {batch.batch_code}",
    )
    await db.commit()
    return _response(await _reload(db, record.id))


@router.post("/{batch_id}/quality-inspection/revise", response_model=QualityInspectionResponse)
async def revise_quality_inspection(
    batch_id: int,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, user, "edit")
    batch = await _batch_or_404(db, batch_id)
    current = await latest_inspection(db, batch_id)
    if not current or current.status != "rejected":
        raise HTTPException(409, "Only a rejected inspection can start a corrective revision")
    record = ProdBatchQualityInspection(
        batch_id=batch_id,
        revision=current.revision + 1,
        status="draft",
        retained_sample=current.retained_sample,
        sample_quantity=current.sample_quantity,
        sample_unit=current.sample_unit,
        storage_condition=current.storage_condition,
        storage_location=current.storage_location,
        disposal_due_date=current.disposal_due_date,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(record)
    await db.flush()
    await create_audit_entry(
        db=db,
        table_name="prod_batch_quality_inspections",
        record_id=record.id,
        action="CREATE",
        changed_by=user.id,
        changed_fields=["revision", "status"],
        new_values={"batch_id": batch_id, "revision": record.revision, "status": "draft"},
        reason=f"Corrective revision after rejected quality inspection {current.id}",
    )
    await db.commit()
    return _response(await _reload(db, record.id))


@router.post("/{batch_id}/quality-inspection/verify", response_model=QualityInspectionResponse)
async def verify_quality_inspection(
    batch_id: int,
    data: QualityInspectionVerify,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, user, "verify")
    batch = await _batch_or_404(db, batch_id)
    record = await latest_inspection(db, batch_id)
    if not record:
        raise HTTPException(404, "Quality inspection not found")
    if record.status != "draft":
        raise HTTPException(409, "Quality inspection is already signed and locked")
    decision = validate_for_verification(record)
    record.status = decision
    record.verified_by = user.id
    record.verified_at = datetime.now(timezone.utc)
    record.verifier_signature_data_url = data.verifier_signature_data_url
    await create_audit_entry(
        db=db,
        table_name="prod_batch_quality_inspections",
        record_id=record.id,
        action="LOCK",
        changed_by=user.id,
        changed_fields=["status", "verified_by", "verified_at", "verifier_signature_data_url"],
        new_values={"status": decision, "revision": record.revision},
        reason=f"QA quality decision for batch {batch.batch_code}",
    )
    await db.commit()
    return _response(await _reload(db, record.id))


@router.post("/{batch_id}/quality-inspection/photo", response_model=QualityInspectionResponse)
async def upload_quality_photo(
    batch_id: int,
    photo: UploadFile = File(...),
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, user, "edit")
    await _batch_or_404(db, batch_id)
    record = await latest_inspection(db, batch_id)
    if not record or record.status != "draft":
        raise HTTPException(409, "Save an editable draft before uploading a photo")
    content_type = (photo.content_type or "").lower()
    if content_type not in PHOTO_TYPES:
        raise HTTPException(415, "Only JPEG, PNG, or WebP photos are supported")
    content = await photo.read(MAX_PHOTO_BYTES + 1)
    if not content or len(content) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Photo must be between 1 byte and 5 MB")
    signature, extension = PHOTO_TYPES[content_type]
    if not content.startswith(signature) or (content_type == "image/webp" and content[8:12] != b"WEBP"):
        raise HTTPException(415, "Photo content does not match its declared type")
    stored_name = f"batch-{batch_id}-quality-{record.id}-{uuid4().hex}{extension}"
    destination = _photo_dir() / stored_name
    destination.write_bytes(content)
    old_name = record.photo_stored_name
    record.photo_stored_name = stored_name
    record.photo_original_name = Path(photo.filename or "quality-photo").name[:255]
    record.photo_content_type = content_type
    record.photo_size_bytes = len(content)
    record.photo_uploaded_by = user.id
    record.photo_uploaded_at = datetime.now(timezone.utc)
    record.updated_by = user.id
    record.updated_at = datetime.now(timezone.utc)
    await create_audit_entry(
        db=db,
        table_name="prod_batch_quality_inspections",
        record_id=record.id,
        action="UPDATE",
        changed_by=user.id,
        changed_fields=["photo"],
        new_values={"photo_content_type": content_type, "photo_size_bytes": len(content)},
        reason=f"Quality sample photo for batch {batch_id}",
    )
    await db.commit()
    if old_name and old_name != stored_name:
        old_path = _photo_dir() / Path(old_name).name
        if old_path.is_file():
            old_path.unlink()
    return _response(await _reload(db, record.id))


@router.get("/{batch_id}/quality-inspection/photo")
async def get_quality_photo(
    batch_id: int,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, user, "view")
    await _batch_or_404(db, batch_id)
    record = await latest_inspection(db, batch_id)
    if not record or not record.photo_stored_name:
        raise HTTPException(404, "Quality photo not found")
    path = _photo_dir() / Path(record.photo_stored_name).name
    if not path.is_file():
        raise HTTPException(404, "Quality photo file is missing")
    return FileResponse(
        path,
        media_type=record.photo_content_type or "application/octet-stream",
        filename=record.photo_original_name or path.name,
        content_disposition_type="inline",
        headers={"Cache-Control": "private, no-store"},
    )


@permissions_router.get("", response_model=QualityPermissionsConfig)
async def get_quality_permissions(
    user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    setting = await db.get(QualityControlSetting, 1)
    rows = {row.role: row for row in (await db.execute(select(QualityRolePermission))).scalars().all()}
    roles = []
    for role in ("Admin", "QA", "Production", "Warehouse", "Captain"):
        if role in ("Admin", "Captain"):
            roles.append(QualityRolePermissionResponse(role=role, can_view=True, can_edit=True, can_verify=True, fixed=True))
        else:
            row = rows.get(role)
            roles.append(QualityRolePermissionResponse(
                role=role,
                can_view=bool(row and row.can_view),
                can_edit=bool(row and row.can_edit),
                can_verify=bool(row and row.can_verify),
            ))
    return QualityPermissionsConfig(enforcement_started_at=setting.enforcement_started_at, roles=roles)


@permissions_router.put("", response_model=QualityPermissionsConfig)
async def update_quality_permissions(
    data: QualityPermissionsUpdate,
    user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    by_role = {item.role: item for item in data.roles}
    if set(by_role) != {"QA", "Production", "Warehouse"}:
        raise HTTPException(422, "QA, Production, and Warehouse permissions must all be supplied")
    for role, item in by_role.items():
        row = await db.get(QualityRolePermission, role)
        if not row:
            row = QualityRolePermission(role=role)
            db.add(row)
        row.can_view = item.can_view
        row.can_edit = item.can_edit
        row.can_verify = item.can_verify
        row.updated_by = user.id
        row.updated_at = datetime.now(timezone.utc)
    await create_audit_entry(
        db=db,
        table_name="quality_role_permissions",
        record_id=0,
        action="UPDATE",
        changed_by=user.id,
        changed_fields=["can_view", "can_edit", "can_verify"],
        new_values={role: item.model_dump() for role, item in by_role.items()},
        reason="Updated batch quality-control role permissions",
    )
    await db.commit()
    return await get_quality_permissions(user=user, db=db)
