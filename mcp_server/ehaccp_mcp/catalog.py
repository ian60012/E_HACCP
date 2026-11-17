"""Static description of log types the MCP is allowed to read."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class LogSpec:
    name: str
    list_path: str
    item_path: str
    date_field: str
    id_field: str = "id"
    page_size: int = 100
    server_date: bool = False
    per_day_param: str | None = None
    ordered_by_date: bool = True
    void_mode: str = "exact"  # exact | include | none
    list_params: Callable[[bool], dict[str, Any]] | None = None


def _void_exact(include_voided: bool) -> dict[str, Any]:
    return {"is_voided": include_voided}


def _void_include(include_voided: bool) -> dict[str, Any]:
    return {"include_voided": include_voided}


LOG_SPECS: dict[str, LogSpec] = {
    "receiving": LogSpec(
        "receiving",
        "/api/v1/receiving-logs",
        "/api/v1/receiving-logs/{id}",
        "created_at",
        list_params=_void_exact,
    ),
    "cooking": LogSpec(
        "cooking",
        "/api/v1/cooking-logs",
        "/api/v1/cooking-logs/{id}",
        "created_at",
        list_params=_void_exact,
    ),
    "cooling": LogSpec(
        "cooling",
        "/api/v1/cooling-logs",
        "/api/v1/cooling-logs/{id}",
        "created_at",
        list_params=_void_exact,
    ),
    "sanitising": LogSpec(
        "sanitising",
        "/api/v1/sanitising-logs",
        "/api/v1/sanitising-logs/{id}",
        "created_at",
        list_params=_void_exact,
    ),
    "cleaning": LogSpec(
        "cleaning",
        "/api/v1/cleaning-checklists",
        "/api/v1/cleaning-checklists/{id}",
        "check_date",
        per_day_param="check_date",
        list_params=_void_exact,
    ),
    "mixing": LogSpec(
        "mixing",
        "/api/v1/mixing-logs",
        "/api/v1/mixing-logs/{id}",
        "created_at",
        list_params=_void_exact,
    ),
    "ppe": LogSpec(
        "ppe",
        "/api/v1/ppe-compliance-logs",
        "/api/v1/ppe-compliance-logs/{id}",
        "check_date",
        per_day_param="check_date",
        ordered_by_date=False,
        list_params=_void_exact,
    ),
    "assembly": LogSpec(
        "assembly",
        "/api/v1/assembly-logs",
        "/api/v1/assembly-logs/{id}",
        "created_at",
        list_params=_void_exact,
    ),
    "deviation": LogSpec(
        "deviation",
        "/api/v1/deviation-logs",
        "/api/v1/deviation-logs/{id}",
        "created_at",
        list_params=_void_exact,
    ),
    "batch": LogSpec(
        "batch",
        "/api/v1/production/batches",
        "/api/v1/production/batches/{id}",
        "production_date",
        server_date=True,
        ordered_by_date=False,
        void_mode="include",
        list_params=_void_include,
    ),
    "batch_sheet": LogSpec(
        "batch_sheet",
        "/api/v1/batch-sheets",
        "/api/v1/production/batches/{id}/batch-sheet",
        "production_date",
        id_field="batch_id",
        void_mode="none",
    ),
    "quality": LogSpec(
        "quality",
        "/api/v1/quality-control/batches",
        "/api/v1/production/batches/{id}/quality-inspection",
        "production_date",
        id_field="batch_id",
        server_date=True,
        ordered_by_date=False,
        void_mode="none",
    ),
}

# NCR is not a separate table. Deviation / CAPA logs are the nonconformance record.
LOG_SPECS["ncr"] = LOG_SPECS["deviation"]

ATTENTION_LOG_TYPES = (
    "receiving",
    "cooking",
    "cooling",
    "sanitising",
    "cleaning",
    "mixing",
    "ppe",
    "assembly",
    "deviation",
    "batch",
    "batch_sheet",
    "quality",
)

SCHEMA_SUMMARY = {
    "auth": {
        "login": "POST /api/v1/auth/login (OAuth2 password form, JWT sub=user id, 30 minute expiry)",
        "identity": "GET /api/v1/auth/me",
        "roles": ["Admin", "QA", "QC", "Production", "Warehouse", "Captain"],
        "notes": [
            "Captain is treated as a super-role by require_role.",
            "QC is a batch-quality role. Quality routes also check quality_role_permissions.",
            "GET /api/v1/auth/demo-token mints a demo JWT with no password. The MCP never calls it.",
            "There is no read-only application role. The MCP service account is a normal user.",
        ],
    },
    "logs": {
        name: {
            "list": spec.list_path,
            "get": spec.item_path,
            "date_field": spec.date_field,
            "server_side_date_filter": spec.server_date or bool(spec.per_day_param),
        }
        for name, spec in LOG_SPECS.items()
        if name != "ncr"
    },
    "ncr": "No NCR table. Use deviation_logs (FSP-CAPA-LOG-001). PPE capa_no is free text, not a foreign key.",
    "traceability": [
        "receiving_logs.supplier_batch_no and inv_stock_doc_id",
        "inv_lots.receiving_log_id and prod_batch_id",
        "inv_stock_movements / inv_stock_docs (OUT documents are the closest dispatch record)",
        "No customer shipment or dispatch table exists in this repository.",
    ],
    "audit": "audit_log has no REST reader. /api/v1/admin/activity lists record creation and is Admin-only.",
    "not_exposed_as_write_tools": "Every POST, PATCH, PUT, and DELETE on /api/v1 stays in the main application.",
}
