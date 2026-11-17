"""Environment configuration. The process fails closed when secrets are missing."""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass


PUBLIC_BIND_HOSTS = {"", "0.0.0.0", "::", "[::]"}


@dataclass(frozen=True)
class Settings:
    mcp_bearer_token: str
    token_fingerprint: str
    mcp_bind_host: str
    mcp_port: int
    mcp_in_docker: bool
    mcp_publish_host: str
    mcp_allowed_hosts: tuple[str, ...]
    mcp_resource_url: str
    haccp_api_base_url: str
    haccp_service_username: str
    haccp_service_password: str
    haccp_readonly_database_url: str
    mcp_audit_log_path: str
    max_scan: int = 2000
    max_limit: int = 100
    default_limit: int = 25
    max_range_days: int = 366
    max_attention_days: int = 92

    @property
    def readonly_db_enabled(self) -> bool:
        return bool(self.haccp_readonly_database_url)


def _hosts(raw: str) -> tuple[str, ...]:
    hosts = [part.strip() for part in raw.split(",") if part.strip()]
    return tuple(hosts or ("127.0.0.1:*", "localhost:*"))


def load_settings(environ: dict[str, str] | None = None) -> Settings:
    env = os.environ if environ is None else environ
    token = env.get("MCP_BEARER_TOKEN", "").strip()
    fingerprint = hashlib.sha256(token.encode("utf-8")).hexdigest()[:12] if token else ""
    return Settings(
        mcp_bearer_token=token,
        token_fingerprint=fingerprint,
        mcp_bind_host=env.get("MCP_BIND_HOST", "127.0.0.1").strip() or "127.0.0.1",
        mcp_port=int(env.get("MCP_PORT", "8765")),
        mcp_in_docker=_flag_from(env, "MCP_IN_DOCKER"),
        mcp_publish_host=env.get("MCP_PUBLISH_HOST", "127.0.0.1").strip(),
        mcp_allowed_hosts=_hosts(env.get("MCP_ALLOWED_HOSTS", "127.0.0.1:*,localhost:*")),
        mcp_resource_url=env.get("MCP_RESOURCE_URL", "http://127.0.0.1:8765").strip(),
        haccp_api_base_url=env.get("HACCP_API_BASE_URL", "http://127.0.0.1:8000").strip().rstrip("/"),
        haccp_service_username=env.get("HACCP_SERVICE_USERNAME", "").strip(),
        haccp_service_password=env.get("HACCP_SERVICE_PASSWORD", ""),
        haccp_readonly_database_url=env.get("HACCP_READONLY_DATABASE_URL", "").strip(),
        mcp_audit_log_path=env.get("MCP_AUDIT_LOG_PATH", "").strip(),
    )


def _flag_from(env: dict[str, str], name: str) -> bool:
    return env.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def validate_runtime(settings: Settings) -> None:
    """Refuse to start when the process would be unauthenticated or publicly bound."""
    if len(settings.mcp_bearer_token) < 16:
        raise RuntimeError("MCP_BEARER_TOKEN must be at least 16 characters")
    if not settings.haccp_service_username or not settings.haccp_service_password:
        raise RuntimeError("HACCP_SERVICE_USERNAME and HACCP_SERVICE_PASSWORD are required")
    if settings.mcp_publish_host in PUBLIC_BIND_HOSTS:
        raise RuntimeError(
            "MCP_PUBLISH_HOST must be 127.0.0.1 or a Tailscale address, not 0.0.0.0"
        )
    if settings.mcp_bind_host in PUBLIC_BIND_HOSTS and not settings.mcp_in_docker:
        raise RuntimeError(
            "Refusing to listen on all interfaces outside Docker. "
            "Use 127.0.0.1, or set MCP_IN_DOCKER=1 behind a non-public published port."
        )
    if not settings.haccp_api_base_url.startswith(("http://", "https://")):
        raise RuntimeError("HACCP_API_BASE_URL must be an http(s) URL")
