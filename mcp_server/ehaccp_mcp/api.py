"""HTTP client for the existing E_HACCP API.

The only write this client performs is the OAuth2 password login that mints
a short-lived JWT. Every other call must be GET. The JWT itself is still a
normal user token; read-only behaviour is enforced here and, when configured,
by the separate Postgres role.
"""

from __future__ import annotations

from typing import Any

import httpx


LOGIN_PATH = "/api/v1/auth/login"


class ApiError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class HaccpApi:
    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
        transport: httpx.BaseTransport | None = None,
        timeout: float = 20.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self._token = ""
        self._client = httpx.Client(base_url=self.base_url, timeout=timeout, transport=transport)

    def close(self) -> None:
        self._client.close()

    def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        method = method.upper()
        if method != "GET" and not (method == "POST" and path == LOGIN_PATH):
            raise ApiError(f"read-only client refused {method} {path}")
        return self._client.request(method, path, **kwargs)

    def get_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        response = self._get(path, params)
        if response.status_code == 401:
            self._login()
            response = self._get(path, params)
        if response.status_code >= 400:
            raise ApiError(f"GET {path} failed with status {response.status_code}", response.status_code)
        return response.json()

    def _get(self, path: str, params: dict[str, Any] | None) -> httpx.Response:
        self._ensure_token()
        return self.request("GET", path, params=_clean_params(params), headers=self._auth_header())

    def _ensure_token(self) -> None:
        if not self._token:
            self._login()

    def _login(self) -> None:
        response = self.request(
            "POST",
            LOGIN_PATH,
            data={"username": self.username, "password": self.password},
        )
        if response.status_code >= 400:
            raise ApiError("service account login failed", response.status_code)
        body = response.json()
        token = body.get("access_token")
        if not token:
            raise ApiError("service account login returned no access token")
        self._token = token

    def _auth_header(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}


def _clean_params(params: dict[str, Any] | None) -> dict[str, Any] | None:
    if not params:
        return None
    return {key: value for key, value in params.items() if value is not None}
