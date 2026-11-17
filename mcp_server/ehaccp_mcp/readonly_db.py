"""Fixed SELECT statements against the optional read-only Postgres role.

There is no general SQL tool. User input is bound as parameters, and each
statement must start with SELECT. The database role is the real control;
the session is also forced read-only.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Callable

from ehaccp_mcp.redact import redact


FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|grant|revoke|copy|truncate|comment|vacuum|execute|call)\b",
    re.IGNORECASE,
)

IDENTITY_SQL = """
SELECT current_user AS db_user,
       current_setting('transaction_read_only') AS transaction_read_only
"""

VISIBLE_TABLES_SQL = """
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'v')
  AND has_table_privilege(current_user, c.oid, 'SELECT')
ORDER BY c.relname
"""

AUDIT_SUMMARY_SQL = """
SELECT table_name, action, COUNT(*)::int AS count
FROM audit_log
WHERE changed_at >= %(start)s
  AND changed_at < %(end)s
GROUP BY table_name, action
ORDER BY table_name, action
"""

TRACE_LOTS_SQL = """
SELECT l.id, l.lot_code, l.origin_type, l.item_id, i.code AS item_code,
       i.name AS item_name, l.supplier_id, l.receiving_log_id, l.prod_batch_id,
       l.created_at
FROM inv_lots l
JOIN inv_items i ON i.id = l.item_id
WHERE (%(lot_code)s::text IS NOT NULL AND l.lot_code = %(lot_code)s)
   OR (%(receiving_log_id)s::int IS NOT NULL AND l.receiving_log_id = %(receiving_log_id)s)
   OR (%(prod_batch_id)s::int IS NOT NULL AND l.prod_batch_id = %(prod_batch_id)s)
   OR (%(receiving_ids)s::int[] IS NOT NULL AND l.receiving_log_id = ANY(%(receiving_ids)s::int[]))
   OR (%(batch_ids)s::int[] IS NOT NULL AND l.prod_batch_id = ANY(%(batch_ids)s::int[]))
ORDER BY l.id
LIMIT 50
"""

TRACE_RECEIVING_SQL = """
SELECT id, product_name, supplier_id, supplier_batch_no, acceptance_status::text AS acceptance_status,
       corrective_action, inv_item_id, inv_stock_doc_id, is_locked, is_voided, created_at
FROM receiving_logs
WHERE (%(ids)s::int[] IS NOT NULL AND id = ANY(%(ids)s::int[]))
   OR (%(supplier_batch_no)s::text IS NOT NULL AND supplier_batch_no = %(supplier_batch_no)s)
ORDER BY id
LIMIT 50
"""

TRACE_BATCHES_SQL = """
SELECT id, batch_code, process_type, product_code, product_name, production_date,
       status::text AS status, is_voided, inv_stock_doc_id, input_stock_doc_id, created_at
FROM prod_batches
WHERE (%(ids)s::int[] IS NOT NULL AND id = ANY(%(ids)s::int[]))
   OR (%(batch_code)s::text IS NOT NULL AND batch_code = %(batch_code)s)
ORDER BY id
LIMIT 50
"""

TRACE_MOVEMENTS_SQL = """
SELECT m.id, m.doc_id, d.doc_number, d.doc_type::text AS doc_type, d.status::text AS status,
       d.receiving_log_id, m.item_id, m.lot_id, m.delta, m.balance_after, m.created_at
FROM inv_stock_movements m
JOIN inv_stock_docs d ON d.id = m.doc_id
WHERE (%(lot_ids)s::int[] IS NOT NULL AND m.lot_id = ANY(%(lot_ids)s::int[]))
   OR (%(doc_ids)s::int[] IS NOT NULL AND d.id = ANY(%(doc_ids)s::int[]))
ORDER BY m.created_at, m.id
LIMIT 200
"""

TRACE_CCP_SQL = """
SELECT 'cooking' AS log_type, id, prod_batch_id, ccp_status::text AS ccp_status,
       corrective_action, is_locked, is_voided, created_at
FROM cooking_logs
WHERE prod_batch_id = ANY(%(batch_ids)s)
UNION ALL
SELECT 'cooling', id, prod_batch_id, ccp_status::text, corrective_action,
       is_locked, is_voided, created_at
FROM cooling_logs
WHERE prod_batch_id = ANY(%(batch_ids)s)
ORDER BY created_at
LIMIT 200
"""


class ReadonlyDbError(Exception):
    pass


class ReadonlyDb:
    def __init__(self, url: str, connect: Callable[..., Any] | None = None):
        self.url = url
        self._connect = connect

    @property
    def enabled(self) -> bool:
        return bool(self.url)

    def identity(self) -> dict[str, Any]:
        rows = self._fetch(IDENTITY_SQL, {})
        return rows[0] if rows else {}

    def visible_tables(self) -> list[str]:
        return [row["table_name"] for row in self._fetch(VISIBLE_TABLES_SQL, {})]

    def audit_summary(self, date_from: date, date_to: date) -> list[dict[str, Any]]:
        end = datetime.combine(date_to + timedelta(days=1), datetime.min.time())
        start = datetime.combine(date_from, datetime.min.time())
        return self._fetch(AUDIT_SUMMARY_SQL, {"start": start, "end": end})

    def trace(
        self,
        *,
        lot_code: str | None = None,
        receiving_log_id: int | None = None,
        prod_batch_id: int | None = None,
        batch_code: str | None = None,
        supplier_batch_no: str | None = None,
    ) -> dict[str, Any]:
        batches = self._fetch(
            TRACE_BATCHES_SQL,
            {"ids": _array([prod_batch_id] if prod_batch_id else []), "batch_code": batch_code},
        )
        receiving = self._fetch(
            TRACE_RECEIVING_SQL,
            {"ids": _array([receiving_log_id] if receiving_log_id else []), "supplier_batch_no": supplier_batch_no},
        )
        lots = self._fetch(
            TRACE_LOTS_SQL,
            {
                "lot_code": lot_code,
                "receiving_log_id": receiving_log_id,
                "prod_batch_id": prod_batch_id,
                "receiving_ids": _array([row["id"] for row in receiving]),
                "batch_ids": _array([row["id"] for row in batches]),
            },
        )
        receiving_ids = _ids(
            [row["id"] for row in receiving]
            + [row["receiving_log_id"] for row in lots if row.get("receiving_log_id")]
            + ([receiving_log_id] if receiving_log_id else [])
        )
        batch_ids = _ids(
            [row["id"] for row in batches]
            + [row["prod_batch_id"] for row in lots if row.get("prod_batch_id")]
            + ([prod_batch_id] if prod_batch_id else [])
        )
        if len(receiving_ids) != len(receiving) or supplier_batch_no:
            receiving = self._fetch(
                TRACE_RECEIVING_SQL,
                {"ids": _array(receiving_ids), "supplier_batch_no": supplier_batch_no},
            )
        if len(batch_ids) != len(batches) or batch_code:
            batches = self._fetch(TRACE_BATCHES_SQL, {"ids": _array(batch_ids), "batch_code": batch_code})
        doc_ids = _ids(
            [row["inv_stock_doc_id"] for row in receiving if row.get("inv_stock_doc_id")]
            + [row["inv_stock_doc_id"] for row in batches if row.get("inv_stock_doc_id")]
            + [row["input_stock_doc_id"] for row in batches if row.get("input_stock_doc_id")]
        )
        lot_ids = _ids([row["id"] for row in lots])
        movements = (
            self._fetch(TRACE_MOVEMENTS_SQL, {"lot_ids": _array(lot_ids), "doc_ids": _array(doc_ids)})
            if lot_ids or doc_ids
            else []
        )
        ccp = self._fetch(TRACE_CCP_SQL, {"batch_ids": batch_ids}) if batch_ids else []
        return redact(
            {
                "lots": lots,
                "receiving": receiving,
                "batches": batches,
                "movements": movements,
                "ccp_logs": ccp,
            }
        )

    def _fetch(self, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        _assert_select(sql)
        if not self.url and self._connect is None:
            raise ReadonlyDbError("read-only database URL is not configured")
        connect = self._connect or _default_connect
        with connect(self.url) as conn:
            with conn.transaction():
                conn.execute("SET LOCAL transaction_read_only = on")
                cursor = conn.execute(sql, params)
                rows = cursor.fetchall()
        return [_jsonable(dict(row)) for row in rows]


def _assert_select(sql: str) -> None:
    stripped = sql.strip().rstrip(";").strip()
    if not stripped.upper().startswith("SELECT") or ";" in stripped:
        raise ReadonlyDbError("only a single SELECT statement is allowed")
    if FORBIDDEN.search(stripped):
        raise ReadonlyDbError("statement contains a forbidden keyword")


def _ids(values: list[int]) -> list[int]:
    unique: list[int] = []
    for value in values:
        if value is not None and value not in unique:
            unique.append(int(value))
    return unique


def _array(values: list[int]) -> list[int] | None:
    """Empty arrays are sent as NULL so the driver does not have to infer a type."""
    return _ids(values) or None


def _default_connect(url: str) -> Any:
    import psycopg
    from psycopg.rows import dict_row

    return psycopg.connect(
        url,
        row_factory=dict_row,
        autocommit=False,
        options="-c default_transaction_read_only=on -c statement_timeout=5000",
    )


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value
