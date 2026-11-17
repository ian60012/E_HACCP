"""Strip signatures, secrets, and oversized payloads before they reach a model."""

from __future__ import annotations

from typing import Any


SECRET_KEYS = {
    "password",
    "password_hash",
    "authorization",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "mcp_bearer_token",
    "haccp_service_password",
}

MAX_STRING = 4000


def redact(value: Any) -> Any:
    return _redact(value, depth=0)


def redact_args(arguments: dict[str, Any] | None) -> dict[str, Any]:
    if not arguments:
        return {}
    return redact(arguments)


def _redact(value: Any, depth: int) -> Any:
    if depth > 8:
        return {"redacted": True, "reason": "max depth"}
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            name = str(key)
            lowered = name.lower()
            if lowered in SECRET_KEYS or "signature_data" in lowered:
                flag = _signature_flag(name) if "signature" in lowered else "redacted"
                if "signature" in lowered:
                    cleaned[flag] = bool(item)
                continue
            cleaned[name] = _redact(item, depth + 1)
        return cleaned
    if isinstance(value, list):
        return [_redact(item, depth + 1) for item in value[:200]]
    if isinstance(value, str):
        if value.startswith("data:") or len(value) > MAX_STRING:
            return {"redacted": True, "length": len(value)}
        return value
    return value


def _signature_flag(key: str) -> str:
    stem = key
    if stem.endswith("_data_url"):
        stem = stem[: -len("_data_url")]
    return f"has_{stem}"
