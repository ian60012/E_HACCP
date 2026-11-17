"""Start the read-only MCP server."""

from __future__ import annotations

import sys

import uvicorn

from ehaccp_mcp.audit import AuditLog, configure_audit_logger
from ehaccp_mcp.config import load_settings, validate_runtime
from ehaccp_mcp.server import build_app, build_service


def main() -> None:
    settings = load_settings()
    try:
        validate_runtime(settings)
    except RuntimeError as exc:
        print(f"ehaccp-mcp: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
    configure_audit_logger()
    app = build_app(settings, build_service(settings), AuditLog(settings.mcp_audit_log_path))
    uvicorn.run(app, host=settings.mcp_bind_host, port=settings.mcp_port, log_level="info")


if __name__ == "__main__":
    main()
