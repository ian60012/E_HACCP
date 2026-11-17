import asyncio
from contextlib import nullcontext
from datetime import date

import httpx
import pytest
from starlette.testclient import TestClient

from ehaccp_mcp.api import ApiError, HaccpApi
from ehaccp_mcp.attention import classify
from ehaccp_mcp.audit import AuditLog, caller_context
from ehaccp_mcp.config import load_settings, validate_runtime
from ehaccp_mcp.readonly_db import ReadonlyDb, ReadonlyDbError
from ehaccp_mcp.redact import redact
from ehaccp_mcp.server import TOOL_NAMES, _CallerMiddleware, build_app, build_mcp
from ehaccp_mcp.service import HaccpService


def test_redact_strips_signatures_and_secrets():
    cleaned = redact(
        {
            "id": 1,
            "operator_signature_data_url": "data:image/png;base64,AAAA",
            "nested": {"password_hash": "hash", "note": "ok"},
            "packing_verifier_signature_data_url": "",
        }
    )

    assert cleaned["has_operator_signature"] is True
    assert cleaned["has_packing_verifier_signature"] is False
    assert "password_hash" not in cleaned["nested"]
    assert "data:image" not in str(cleaned)


def test_attention_flags_cover_unsigned_incomplete_and_overdue():
    flags = classify(
        "cooking",
        {
            "created_at": "2026-01-01T00:00:00+00:00",
            "is_locked": False,
            "is_voided": False,
            "end_time": None,
            "core_temp": None,
            "ccp_status": "Fail",
            "corrective_action": "",
        },
        as_of=date(2026, 1, 5),
        overdue_days=1,
    )

    assert flags == ["unsigned", "unlocked", "incomplete", "overdue"]
    assert classify("receiving", {"is_locked": True, "is_voided": False, "acceptance_status": "Accept"}, as_of=date(2026, 1, 5), overdue_days=1) == []
    assert "unreviewed" in classify(
        "ppe",
        {"is_locked": False, "is_voided": False, "reviewed_by": None, "created_at": "2026-01-05"},
        as_of=date(2026, 1, 5),
        overdue_days=2,
    )


def test_api_client_is_get_only_and_refreshes_a_rejected_token():
    calls = {"login": 0, "me": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/auth/login":
            calls["login"] += 1
            assert request.method == "POST"
            assert b"username=mcp" in request.content
            return httpx.Response(200, json={"access_token": f"jwt-{calls['login']}", "token_type": "bearer"})
        if request.url.path == "/api/v1/cooking-logs":
            raise AssertionError("the client should refuse this before the network")
        calls["me"] += 1
        if calls["me"] == 1:
            return httpx.Response(401, json={"detail": "expired"})
        assert request.headers["authorization"] == "Bearer jwt-2"
        return httpx.Response(200, json={"id": 4, "username": "mcp", "role": "Admin"})

    api = HaccpApi("http://backend", "mcp", "secret", transport=httpx.MockTransport(handler))
    with pytest.raises(ApiError, match="refused POST"):
        api.request("POST", "/api/v1/cooking-logs", json={"batch_id": "x"})

    identity = api.get_json("/api/v1/auth/me")

    assert identity["username"] == "mcp"
    assert calls["login"] == 2
    api.close()


def test_list_records_filters_dates_and_hides_signatures():
    rows = [
        _cooking(5, "2026-01-05"),
        _cooking(4, "2026-01-04"),
        _cooking(3, "2026-01-03"),
        _cooking(2, "2026-01-02"),
        _cooking(1, "2026-01-01"),
    ]
    service = HaccpService(_pages({"/api/v1/cooking-logs": rows}), max_scan=50)
    result = service.list_records("cooking", "2026-01-03", "2026-01-04", limit=10)

    assert result["ok"] is True
    assert [item["record_id"] for item in result["items"]] == [4, 3]
    assert result["scanned"] == 4
    assert result["has_more"] is False
    assert result["items"][0]["has_operator_signature"] is True
    assert "operator_signature_data_url" not in result["items"][0]
    assert service.api.calls[0][1]["is_voided"] is False


def test_attention_and_ccp_and_ncr_use_the_api():
    cooking = [_cooking(8, "2026-01-04", ccp_status="Fail", corrective_action=None, end_time=None, core_temp=None)]
    deviations = [
        {
            "id": 3,
            "created_at": "2026-01-04T00:00:00+00:00",
            "is_locked": False,
            "is_voided": False,
            "closed_at": None,
            "severity": "Major",
            "description": "Core temperature failed",
            "source_log_type": "cooking",
            "source_log_id": 8,
        }
    ]
    routes = {
        "/api/v1/cooking-logs": cooking,
        "/api/v1/cooling-logs": [],
        "/api/v1/receiving-logs": [],
        "/api/v1/sanitising-logs": [],
        "/api/v1/deviation-logs": deviations,
        "/api/v1/deviation-logs/3": deviations[0],
    }
    service = HaccpService(_pages(routes), today=lambda: date(2026, 1, 6))
    attention = service.find_attention_records("2026-01-04", "2026-01-04", log_types=["cooking", "deviation"])
    ccp = service.list_ccp_deviations("2026-01-04", "2026-01-04")
    ncr = service.get_ncr(3)

    assert attention["ok"] is True
    assert {item["log_type"] for item in attention["items"]} == {"cooking", "deviation"}
    assert ccp["deviations"]["cooking"][0]["record_id"] == 8
    assert ccp["deviations"]["deviation"][0]["description"] == "Core temperature failed"
    assert ncr["log_type"] == "ncr"
    assert ncr["record"]["record_id"] == 3


def test_trace_api_links_lot_receiving_batch_and_dispatch():
    routes = {
        "/api/v1/inventory/lots": [
            {"id": 7, "lot_code": "LOT-1", "item_id": 2, "receiving_log_id": 3, "prod_batch_id": 9}
        ],
        "/api/v1/receiving-logs/3": {"id": 3, "product_name": "Beef", "inv_stock_doc_id": 11, "supplier_batch_no": "SB"},
        "/api/v1/production/batches/9": {"id": 9, "batch_code": "B-9", "inv_stock_doc_id": 12},
        "/api/v1/inventory/docs/11": {"id": 11, "doc_number": "IN-11", "doc_type": "IN"},
        "/api/v1/inventory/docs/12": {"id": 12, "doc_number": "OUT-12", "doc_type": "OUT"},
        "/api/v1/inventory/balance/movements": [
            {"id": 1, "item_id": 2, "lot_id": 7, "doc_id": 12, "delta": "-1.000"}
        ],
        "/api/v1/cooking-logs": [],
        "/api/v1/cooling-logs": [],
        "/api/v1/mixing-logs": [],
        "/api/v1/assembly-logs": [],
    }
    service = HaccpService(_routes(routes))
    result = service.trace_lot(lot_code="LOT-1", source="api")

    assert result["source"] == "api"
    assert result["receiving"][0]["supplier_batch_no"] == "SB"
    assert result["batches"][0]["batch_code"] == "B-9"
    assert {doc["doc_type"] for doc in result["stock_documents"]} == {"IN", "OUT"}
    assert result["movements"][0]["lot_id"] == 7


def test_readonly_sql_trace_and_audit_summary_are_select_only():
    conn = FakeConn()
    db = ReadonlyDb("", connect=lambda url: conn)
    db.url = "postgresql://haccp_mcp_ro@postgres/haccp_db"
    traced = db.trace(lot_code="LOT-1")
    summary = db.audit_summary(date(2026, 1, 1), date(2026, 1, 31))

    assert traced["lots"][0]["lot_code"] == "LOT-1"
    assert traced["movements"][0]["doc_type"] == "OUT"
    assert summary[0]["action"] == "LOCK"
    assert any(sql.startswith("SET LOCAL transaction_read_only") for sql, _params in conn.sql)
    with pytest.raises(ReadonlyDbError):
        db._fetch("DELETE FROM cooking_logs", {})
    assert "signature" not in str(traced)


def test_audit_summary_does_not_send_the_crashing_date_to_parameter():
    service = HaccpService(_pages({"/api/v1/admin/activity": [
        {"module": "cooking", "record_id": 1, "created_at": "2026-01-31T10:00:00", "is_locked": True, "is_voided": False},
        {"module": "cooking", "record_id": 2, "created_at": "2026-02-01T10:00:00", "is_locked": False, "is_voided": False},
    ]}))
    result = service.audit_period_summary("2026-01-31", "2026-01-31")

    assert result["record_activity"]["by_module"]["cooking"]["created"] == 1
    assert result["record_activity"]["by_module"]["cooking"]["locked"] == 1
    assert "date_to" not in service.api.calls[0][1]
    assert result["audit_log"]["available"] is False


def test_audit_log_records_tool_args_caller_and_timestamp_without_secrets():
    events = []
    audit = AuditLog(sink=events.append)
    token = caller_context.set({"label": "cursor-agent", "token_fp": "abc123"})
    try:
        audit.span(
            "list_records",
            {"log_type": "cooking", "password": "secret", "operator_signature_data_url": "data:image/png;base64,AAAA"},
            lambda: {"ok": True},
        )
    finally:
        caller_context.reset(token)

    event = events[0]
    assert event["tool"] == "list_records"
    assert event["caller"] == {"label": "cursor-agent", "token_fp": "abc123"}
    assert event["ok"] is True
    assert "ts" in event
    assert "password" not in event["args"]
    assert event["args"]["has_operator_signature"] is True


def test_runtime_refuses_a_public_bind_and_a_short_token():
    public = load_settings({"MCP_BEARER_TOKEN": "1234567890123456", "MCP_PUBLISH_HOST": "0.0.0.0", "HACCP_SERVICE_USERNAME": "mcp", "HACCP_SERVICE_PASSWORD": "pw"})
    with pytest.raises(RuntimeError, match="Tailscale"):
        validate_runtime(public)
    short = load_settings({"MCP_BEARER_TOKEN": "short", "HACCP_SERVICE_USERNAME": "mcp", "HACCP_SERVICE_PASSWORD": "pw"})
    with pytest.raises(RuntimeError, match="16"):
        validate_runtime(short)


def test_registered_tools_are_only_the_read_only_set():
    settings = _settings()
    service = HaccpService(_routes({"/": {"message": "ok"}, "/health": {"status": "healthy"}, "/api/v1/auth/me": {"id": 1, "username": "mcp", "role": "Admin"}}))
    events = []
    mcp = build_mcp(settings, service, AuditLog(sink=events.append))
    tools = asyncio.run(mcp.list_tools())

    assert tuple(tool.name for tool in tools) == TOOL_NAMES
    assert all(tool.annotations.readOnlyHint is True for tool in tools)
    assert all(tool.annotations.destructiveHint is False for tool in tools)
    assert not any(name.startswith(("create", "update", "delete", "lock", "void", "post")) for name in TOOL_NAMES)
    health = next(tool for tool in mcp._tool_manager.list_tools() if tool.name == "health_and_schema")
    asyncio.run(health.run({}))
    assert events[0]["tool"] == "health_and_schema"
    assert events[0]["caller"]["label"] == "in-process"


def test_http_health_is_open_and_mcp_requires_the_bearer_token():
    settings = _settings()
    app = build_app(settings, HaccpService(_routes({})), AuditLog())
    with TestClient(app) as client:
        assert client.get("/healthz").json() == {"status": "ok"}
        denied = client.post("/mcp", json={})
        assert denied.status_code == 401
        wrong = client.post("/mcp", json={}, headers={"Authorization": "Bearer not-the-token"})
        assert wrong.status_code == 401


def test_caller_header_reaches_the_audit_context():
    seen = {}

    class App:
        async def __call__(self, scope, receive, send):
            seen["caller"] = caller_context.get()
            await send({"type": "http.response.start", "status": 204, "headers": []})
            await send({"type": "http.response.body", "body": b""})

    middleware = _CallerMiddleware(App(), "fp123")

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(_message):
        return None

    asyncio.run(
        middleware(
            {"type": "http", "headers": [(b"x-mcp-caller", b"qa-review")]},
            receive,
            send,
        )
    )
    assert seen["caller"] == {"label": "qa-review", "token_fp": "fp123"}


def test_role_sql_is_not_executed_by_the_server():
    root = __import__("pathlib").Path(__file__).resolve().parents[1]
    sql = (root / "sql" / "create_readonly_role.sql").read_text()
    assert "CREATE ROLE" in sql
    assert "password_hash" in sql
    assert "haccp_mcp_ro" in sql
    for path in (root / "ehaccp_mcp").rglob("*.py"):
        source = path.read_text()
        assert "create_readonly_role" not in source
        assert "CREATE ROLE" not in source


class FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class FakeConn:
    def __init__(self):
        self.sql = []

    def execute(self, sql, params=None):
        text = str(sql)
        self.sql.append((text.strip(), params))
        if "current_user" in text:
            return FakeCursor([{"db_user": "haccp_mcp_ro", "transaction_read_only": "on"}])
        if "FROM audit_log" in text:
            return FakeCursor([{"table_name": "cooking_logs", "action": "LOCK", "count": 2}])
        if "FROM inv_lots" in text:
            return FakeCursor([_lot_row()])
        if "FROM receiving_logs" in text:
            return FakeCursor([_receiving_row()])
        if "FROM prod_batches" in text:
            return FakeCursor([_batch_row()])
        if "FROM inv_stock_movements" in text:
            return FakeCursor([{"id": 1, "doc_id": 12, "doc_number": "OUT-1", "doc_type": "OUT", "status": "Posted", "receiving_log_id": None, "item_id": 1, "lot_id": 7, "delta": "-1", "balance_after": "0", "created_at": "2026-01-03"}])
        if "FROM cooking_logs" in text:
            return FakeCursor([{"log_type": "cooking", "id": 4, "prod_batch_id": 9, "ccp_status": "Pass", "corrective_action": None, "is_locked": True, "is_voided": False, "created_at": "2026-01-02"}])
        return FakeCursor([])

    def transaction(self):
        return nullcontext()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class FakeApi:
    def __init__(self, resolver):
        self.resolver = resolver
        self.calls = []

    def get_json(self, path, params=None):
        self.calls.append((path, params or {}))
        return self.resolver(path, params or {})


def _pages(tables):
    def resolve(path, params):
        value = tables.get(path, [])
        if isinstance(value, dict) and "items" not in value:
            return value
        rows = value
        skip = int(params.get("skip") or 0)
        limit = int(params.get("limit") or len(rows) or 1)
        return {"items": rows[skip : skip + limit], "total": len(rows), "skip": skip, "limit": limit}

    return FakeApi(resolve)


def _routes(routes):
    def resolve(path, params):
        if path in routes and not isinstance(routes[path], list):
            return routes[path]
        rows = routes.get(path, [])
        skip = int(params.get("skip") or 0)
        limit = int(params.get("limit") or len(rows) or 1)
        return {"items": rows[skip : skip + limit], "total": len(rows), "skip": skip, "limit": limit}

    return FakeApi(resolve)


def _cooking(record_id, day, **extra):
    row = {
        "id": record_id,
        "created_at": f"{day}T08:00:00+00:00",
        "operator_signature_data_url": "data:image/png;base64,AAAA",
        "is_locked": True,
        "is_voided": False,
        "end_time": f"{day}T09:00:00+00:00",
        "core_temp": "82.00",
        "ccp_status": "Pass",
        "corrective_action": None,
    }
    row.update(extra)
    return row


def _lot_row():
    return {
        "id": 7,
        "lot_code": "LOT-1",
        "origin_type": "receiving",
        "item_id": 1,
        "item_code": "BEEF",
        "item_name": "Beef",
        "supplier_id": 1,
        "receiving_log_id": 3,
        "prod_batch_id": 9,
        "created_at": "2026-01-01",
    }


def _receiving_row():
    return {
        "id": 3,
        "product_name": "Beef",
        "supplier_id": 1,
        "supplier_batch_no": "SB",
        "acceptance_status": "Accept",
        "corrective_action": None,
        "inv_item_id": 1,
        "inv_stock_doc_id": 11,
        "is_locked": True,
        "is_voided": False,
        "created_at": "2026-01-01",
    }


def _batch_row():
    return {
        "id": 9,
        "batch_code": "B-9",
        "process_type": "hot_process",
        "product_code": "P",
        "product_name": "Soup",
        "production_date": "2026-01-02",
        "status": "closed",
        "is_voided": False,
        "inv_stock_doc_id": 12,
        "input_stock_doc_id": None,
        "created_at": "2026-01-02",
    }


def _settings():
    return load_settings(
        {
            "MCP_BEARER_TOKEN": "a" * 24,
            "MCP_BIND_HOST": "127.0.0.1",
            "MCP_PUBLISH_HOST": "127.0.0.1",
            "MCP_RESOURCE_URL": "http://127.0.0.1:8765",
            "MCP_ALLOWED_HOSTS": "127.0.0.1:*,localhost:*,testserver",
            "HACCP_API_BASE_URL": "http://backend:8000",
            "HACCP_SERVICE_USERNAME": "mcp-reader",
            "HACCP_SERVICE_PASSWORD": "secret",
        }
    )
