from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.schemas.quality_control import QualityRolePermissionUpdate
from app.services.quality_control import validate_for_verification


def record(**overrides):
    values = dict(
        inspection_at=datetime.now(timezone.utc),
        color_result="pass",
        aroma_result="pass",
        taste_result="pass",
        not_applicable_reason=None,
        corrective_action=None,
        retained_sample=True,
        no_sample_reason=None,
        sample_code="BATCH-S1",
        sample_quantity=1,
        sample_unit="pack",
        sampled_at=datetime.now(timezone.utc),
        storage_condition="frozen",
        storage_location="QA freezer / shelf 1",
        disposal_due_date=date.today(),
    )
    values.update(overrides)
    return SimpleNamespace(**values)


def test_complete_passing_inspection_is_approved():
    assert validate_for_verification(record()) == "approved"


def test_failed_inspection_requires_corrective_action_and_is_rejected():
    with pytest.raises(HTTPException):
        validate_for_verification(record(taste_result="fail"))
    assert validate_for_verification(record(taste_result="fail", corrective_action="Hold and rework")) == "rejected"


def test_no_retained_sample_requires_reason():
    with pytest.raises(HTTPException):
        validate_for_verification(record(retained_sample=False, no_sample_reason=None))
    assert validate_for_verification(record(retained_sample=False, no_sample_reason="Product is not sampled")) == "approved"


def test_permission_dependencies_are_validated():
    with pytest.raises(ValueError):
        QualityRolePermissionUpdate(role="Production", can_view=False, can_edit=True, can_verify=False)
    valid = QualityRolePermissionUpdate(role="QA", can_view=True, can_edit=True, can_verify=True)
    assert valid.can_verify is True


def test_qc_role_can_receive_full_quality_permissions():
    permission = QualityRolePermissionUpdate(
        role="QC",
        can_view=True,
        can_edit=True,
        can_verify=True,
    )
    assert permission.role == "QC"
