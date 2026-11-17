"""Structured per-call audit log. Tokens and signatures are never written."""

from __future__ import annotations

import json
import logging
import os
import time
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Callable

from ehaccp_mcp.redact import redact_args


caller_context: ContextVar[dict[str, str]] = ContextVar(
    "ehaccp_mcp_caller",
    default={"label": "in-process", "token_fp": ""},
)

logger = logging.getLogger("ehaccp.mcp.audit")


class AuditLog:
    def __init__(self, path: str = "", sink: Callable[[dict[str, Any]], None] | None = None):
        self.path = path
        self.sink = sink

    def record(self, event: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "event": "mcp_tool_call",
            **event,
        }
        if "args" in payload:
            payload["args"] = redact_args(payload.get("args") or {})
        line = json.dumps(payload, default=str, ensure_ascii=False, sort_keys=True)
        logger.info(line)
        if self.sink is not None:
            self.sink(payload)
        if self.path:
            try:
                directory = os.path.dirname(self.path)
                if directory:
                    os.makedirs(directory, exist_ok=True)
                with open(self.path, "a", encoding="utf-8") as handle:
                    handle.write(line + "\n")
            except OSError:
                logger.warning("audit file unavailable")
        return payload

    def span(self, tool: str, args: dict[str, Any] | None, fn: Callable[[], Any]) -> Any:
        started = time.perf_counter()
        caller = dict(caller_context.get())
        try:
            result = fn()
        except Exception as exc:
            self.record(
                {
                    "tool": tool,
                    "args": args or {},
                    "caller": caller,
                    "ok": False,
                    "duration_ms": _elapsed(started),
                    "error": type(exc).__name__,
                }
            )
            raise
        ok = not (isinstance(result, dict) and result.get("ok") is False)
        self.record(
            {
                "tool": tool,
                "args": args or {},
                "caller": caller,
                "ok": ok,
                "duration_ms": _elapsed(started),
                "error": None if ok else str(result.get("error", ""))[:300],
            }
        )
        return result


def configure_audit_logger() -> None:
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not any(isinstance(handler, logging.StreamHandler) for handler in logger.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)


def _elapsed(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
