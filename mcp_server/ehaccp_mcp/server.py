"""Streamable HTTP MCP server. Every registered tool is read-only."""

from __future__ import annotations

import re
import secrets
from typing import Any

from mcp.server.auth.provider import AccessToken
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import AnyHttpUrl
from starlette.requests import Request
from starlette.responses import JSONResponse

from ehaccp_mcp.api import HaccpApi
from ehaccp_mcp.audit import AuditLog, caller_context
from ehaccp_mcp.config import Settings
from ehaccp_mcp.readonly_db import ReadonlyDb
from ehaccp_mcp.service import HaccpService


READ_ONLY = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=True)
TOOL_NAMES = (
    "health_and_schema",
    "list_records",
    "get_record",
    "find_attention_records",
    "trace_lot",
    "list_ccp_deviations",
    "list_ncr",
    "get_ncr",
    "audit_period_summary",
    "list_label_templates",
)
_CALLER_RE = re.compile(r"[^A-Za-z0-9 ._:\-@]")


class StaticBearerVerifier:
    """Compares the bearer token with MCP_BEARER_TOKEN. There is no OAuth login."""

    def __init__(self, token: str, fingerprint: str):
        self._token = token
        self._fingerprint = fingerprint

    async def verify_token(self, token: str) -> AccessToken | None:
        if not token or len(token) != len(self._token) or not secrets.compare_digest(token, self._token):
            return None
        return AccessToken(token="", client_id=self._fingerprint, scopes=["haccp:read"])


def build_service(settings: Settings, api: HaccpApi | None = None, db: ReadonlyDb | None = None) -> HaccpService:
    client = api or HaccpApi(
        settings.haccp_api_base_url,
        settings.haccp_service_username,
        settings.haccp_service_password,
    )
    database = db if db is not None else ReadonlyDb(settings.haccp_readonly_database_url)
    return HaccpService(
        client,
        database,
        max_scan=settings.max_scan,
        max_limit=settings.max_limit,
        default_limit=settings.default_limit,
        max_range_days=settings.max_range_days,
        max_attention_days=settings.max_attention_days,
    )


def build_mcp(settings: Settings, service: HaccpService, audit: AuditLog) -> FastMCP:
    resource = AnyHttpUrl(settings.mcp_resource_url)
    mcp = FastMCP(
        "E_HACCP",
        instructions=(
            "Read-only window onto the E_HACCP food-safety system. "
            "Do not invent records, signatures, or corrective actions. "
            "There is no NCR table: nonconformance lives in deviation logs. "
            "Dispatch is an inventory OUT movement, not a shipment document. "
            "Signature images are removed before they reach you."
        ),
        host=settings.mcp_bind_host,
        port=settings.mcp_port,
        stateless_http=True,
        json_response=True,
        token_verifier=StaticBearerVerifier(settings.mcp_bearer_token, settings.token_fingerprint),
        auth=AuthSettings(
            issuer_url=resource,
            resource_server_url=resource,
            required_scopes=["haccp:read"],
        ),
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=list(settings.mcp_allowed_hosts),
            allowed_origins=[],
        ),
    )

    def tool(fn):
        name = fn.__name__
        if name not in TOOL_NAMES:
            raise RuntimeError(f"refusing to register unexpected tool {name}")

        def wrapped(*args, **kwargs):
            return audit.span(name, kwargs or _positional(fn, args), lambda: fn(*args, **kwargs))

        wrapped.__name__ = name
        wrapped.__doc__ = fn.__doc__
        wrapped.__annotations__ = getattr(fn, "__annotations__", {})
        wrapped.__signature__ = __import__("inspect").signature(fn)
        return mcp.tool(name=name, annotations=READ_ONLY)(wrapped)

    @tool
    def health_and_schema() -> dict:
        """Show API health, the service account identity, the readable schema, and whether the read-only database role is connected. No row data."""
        return service.health_and_schema()

    @tool
    def list_records(
        log_type: str,
        date_from: str | None = None,
        date_to: str | None = None,
        skip: int = 0,
        limit: int | None = None,
        include_voided: bool = False,
    ) -> dict:
        """List HACCP records. log_type is receiving, cooking, cooling, sanitising, cleaning, mixing, ppe, assembly, deviation, batch, batch_sheet, or quality. Dates are inclusive YYYY-MM-DD. Without dates, only the newest page is read. Signature images are removed."""
        return service.list_records(log_type, date_from, date_to, skip, limit, include_voided)

    @tool
    def get_record(log_type: str, record_id: int) -> dict:
        """Fetch one record by id. log_type matches list_records, plus ncr (a deviation) and label (one LabelMaker template)."""
        return service.get_record(log_type, record_id)

    @tool
    def find_attention_records(
        date_from: str,
        date_to: str,
        kinds: list[str] | None = None,
        log_types: list[str] | None = None,
        overdue_days: int = 1,
        limit: int | None = None,
    ) -> dict:
        """Find unsigned, unreviewed, unlocked, incomplete, overdue, or open CAPA records in a date window. kinds default to all of those. Legacy rows may lack a signature that newer forms require."""
        return service.find_attention_records(date_from, date_to, kinds, log_types, overdue_days, limit)

    @tool
    def trace_lot(
        lot_code: str | None = None,
        receiving_log_id: int | None = None,
        prod_batch_id: int | None = None,
        batch_code: str | None = None,
        supplier_batch_no: str | None = None,
        source: str = "auto",
    ) -> dict:
        """Trace a receiving lot through production and inventory movements. Provide one identifier. source auto uses the read-only SQL role when configured, otherwise the API. OUT movements are dispatch; there is no shipment table."""
        return service.trace_lot(lot_code, receiving_log_id, prod_batch_id, batch_code, supplier_batch_no, source)

    @tool
    def list_ccp_deviations(date_from: str, date_to: str, limit: int | None = None) -> dict:
        """List CCP failures and their corrective actions for cooking, cooling, receiving, and sanitising, plus deviation/CAPA rows in the same dates."""
        return service.list_ccp_deviations(date_from, date_to, limit)

    @tool
    def list_ncr(
        date_from: str | None = None,
        date_to: str | None = None,
        is_open: bool | None = None,
        severity: str | None = None,
        skip: int = 0,
        limit: int | None = None,
    ) -> dict:
        """List nonconformance records. These are deviation_logs (FSP-CAPA-LOG-001). There is no separate NCR table. severity is Critical, Major, or Minor."""
        return service.list_ncr(date_from, date_to, is_open, severity, skip, limit)

    @tool
    def get_ncr(record_id: int) -> dict:
        """Fetch one nonconformance / deviation record, including root cause, preventive action, and closure fields."""
        return service.get_ncr(record_id)

    @tool
    def audit_period_summary(date_from: str, date_to: str) -> dict:
        """Summarise a period. record_activity counts created HACCP rows from the admin feed. audit_log change counts are included only when the read-only database role is configured, and value payloads are not returned."""
        return service.audit_period_summary(date_from, date_to)

    @tool
    def list_label_templates() -> dict:
        """List LabelMaker templates with names, pack size, shelf life, and allergen tags. Recipe text is omitted until get_record is called for one template."""
        return service.list_label_templates()

    @mcp.custom_route("/healthz", methods=["GET"], include_in_schema=False)
    async def healthz(_: Request) -> JSONResponse:
        return JSONResponse({"status": "ok"})

    return mcp


def build_app(settings: Settings, service: HaccpService | None = None, audit: AuditLog | None = None):
    audit_log = audit or AuditLog(settings.mcp_audit_log_path)
    mcp = build_mcp(settings, service or build_service(settings), audit_log)
    app = mcp.streamable_http_app()
    app.add_middleware(_CallerMiddleware, fingerprint=settings.token_fingerprint)
    return app


class _CallerMiddleware:
    def __init__(self, app, fingerprint: str):
        self.app = app
        self.fingerprint = fingerprint

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        headers = {key.decode("latin1").lower(): value.decode("latin1") for key, value in scope.get("headers", [])}
        label = _CALLER_RE.sub("", headers.get("x-mcp-caller", ""))[:80] or "bearer"
        token = caller_context.set({"label": label, "token_fp": self.fingerprint})
        try:
            await self.app(scope, receive, send)
        finally:
            caller_context.reset(token)


def _positional(fn, args: tuple[Any, ...]) -> dict[str, Any]:
    import inspect

    names = [param.name for param in inspect.signature(fn).parameters.values()]
    return dict(zip(names, args))
