"""Read-only query operations shared by the MCP tools."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Callable

from ehaccp_mcp.api import ApiError, HaccpApi
from ehaccp_mcp.attention import classify, matches_kind, record_day
from ehaccp_mcp.catalog import ATTENTION_LOG_TYPES, LOG_SPECS, SCHEMA_SUMMARY, LogSpec
from ehaccp_mcp.readonly_db import ReadonlyDb, ReadonlyDbError
from ehaccp_mcp.redact import redact


@dataclass
class Scan:
    matched: list[dict[str, Any]] = field(default_factory=list)
    scanned: int = 0
    truncated: bool = False
    notes: list[str] = field(default_factory=list)


class HaccpService:
    def __init__(
        self,
        api: HaccpApi,
        db: ReadonlyDb | None = None,
        *,
        max_scan: int = 2000,
        max_limit: int = 100,
        default_limit: int = 25,
        max_range_days: int = 366,
        max_attention_days: int = 92,
        today: Callable[[], date] | None = None,
    ):
        self.api = api
        self.db = db
        self.max_scan = max_scan
        self.max_limit = max_limit
        self.default_limit = default_limit
        self.max_range_days = max_range_days
        self.max_attention_days = max_attention_days
        self.today = today or date.today

    def health_and_schema(self) -> dict[str, Any]:
        try:
            api_root = self.api.get_json("/")
            api_health = self.api.get_json("/health")
            identity = redact(self.api.get_json("/api/v1/auth/me"))
        except ApiError as exc:
            return _error(exc)
        database = self._database_status()
        return {
            "ok": True,
            "api": {"root": api_root, "health": api_health},
            "service_account": identity,
            "schema": SCHEMA_SUMMARY,
            "readonly_database": database,
            "limits": {
                "default_limit": self.default_limit,
                "max_limit": self.max_limit,
                "max_scan": self.max_scan,
            },
        }

    def list_records(
        self,
        log_type: str,
        date_from: str | None = None,
        date_to: str | None = None,
        skip: int = 0,
        limit: int | None = None,
        include_voided: bool = False,
    ) -> dict[str, Any]:
        spec = _spec(log_type)
        if isinstance(spec, dict):
            return spec
        try:
            start, end = _range(date_from, date_to, self.max_range_days, required=False)
            bounded = _limit(limit, self.default_limit, self.max_limit)
            offset = max(0, int(skip))
        except ValueError as exc:
            return _error(exc)
        try:
            scan = self._scan(spec, start, end, include_voided, first_page_only=start is None and end is None)
        except ApiError as exc:
            return _error(exc)
        page = scan.matched[offset : offset + bounded]
        return {
            "ok": True,
            "log_type": spec.name,
            "items": [self._present(spec, row) for row in page],
            "returned": len(page),
            "skip": offset,
            "limit": bounded,
            "scanned": scan.scanned,
            "matched": len(scan.matched),
            "truncated": scan.truncated,
            "has_more": scan.truncated or offset + bounded < len(scan.matched),
            "notes": scan.notes,
            "source": "api",
        }

    def get_record(self, log_type: str, record_id: int) -> dict[str, Any]:
        if log_type == "label":
            return self._get_label(record_id)
        spec = _spec(log_type)
        if isinstance(spec, dict):
            return spec
        try:
            payload = self._get_optional(spec.item_path.format(id=int(record_id)))
        except ApiError as exc:
            return _error(exc)
        if payload is None:
            return {"ok": False, "error": f"{spec.name} {record_id} was not found", "status": 404}
        return {"ok": True, "log_type": spec.name, "record": self._present(spec, payload)}

    def find_attention_records(
        self,
        date_from: str,
        date_to: str,
        kinds: list[str] | None = None,
        log_types: list[str] | None = None,
        overdue_days: int = 1,
        limit: int | None = None,
    ) -> dict[str, Any]:
        selected_kinds = kinds or ["unsigned", "unlocked", "incomplete", "overdue", "open_capa"]
        unknown = [kind for kind in selected_kinds if kind not in {"unsigned", "unlocked", "incomplete", "overdue", "open_capa", "rejected"}]
        if unknown:
            return _error(ValueError(f"unknown attention kinds: {', '.join(unknown)}"))
        names = log_types or list(ATTENTION_LOG_TYPES)
        try:
            start, end = _range(date_from, date_to, self.max_attention_days, required=True)
            bounded = _limit(limit, self.default_limit, self.max_limit)
            assert start is not None and end is not None
        except ValueError as exc:
            return _error(exc)
        as_of = self.today()
        findings: list[dict[str, Any]] = []
        notes: list[str] = []
        truncated = False
        try:
            for name in names:
                spec = _spec(name)
                if isinstance(spec, dict):
                    return spec
                scan = self._scan(spec, start, end, include_voided=False)
                truncated = truncated or scan.truncated
                notes.extend(scan.notes)
                findings.extend(self._flagged(spec, scan.matched, selected_kinds, as_of, overdue_days))
                if "deviation" == spec.name and any(kind in selected_kinds for kind in ("open_capa", "overdue")):
                    open_scan = self._scan(
                        spec,
                        None,
                        None,
                        False,
                        extra={"is_open": True},
                        first_page_only=True,
                    )
                    notes.append("Open deviations are also read from the newest open page, including rows outside the date window.")
                    findings.extend(self._flagged(spec, open_scan.matched, selected_kinds, as_of, overdue_days))
        except ApiError as exc:
            return _error(exc)
        unique = _dedupe_findings(findings)
        return {
            "ok": True,
            "items": unique[:bounded],
            "returned": min(len(unique), bounded),
            "matched": len(unique),
            "has_more": len(unique) > bounded,
            "truncated": truncated,
            "kinds": selected_kinds,
            "as_of": as_of.isoformat(),
            "overdue_days": overdue_days,
            "notes": _unique(notes),
            "legacy_signature_note": (
                "Cooking, cooling, mixing, assembly, and batch creation require an operator signature "
                "on new records. Older rows can be unsigned and still valid. Receiving, sanitising, PPE, "
                "and deviation records do not store handwritten signatures."
            ),
        }

    def trace_lot(
        self,
        lot_code: str | None = None,
        receiving_log_id: int | None = None,
        prod_batch_id: int | None = None,
        batch_code: str | None = None,
        supplier_batch_no: str | None = None,
        source: str = "auto",
    ) -> dict[str, Any]:
        if not any([lot_code, receiving_log_id, prod_batch_id, batch_code, supplier_batch_no]):
            return _error(ValueError("provide lot_code, receiving_log_id, prod_batch_id, batch_code, or supplier_batch_no"))
        if source not in {"auto", "api", "sql"}:
            return _error(ValueError("source must be auto, api, or sql"))
        use_sql = source == "sql" or (source == "auto" and self.db is not None and self.db.enabled)
        if use_sql:
            if self.db is None or not self.db.enabled:
                return _error(ReadonlyDbError("read-only database URL is not configured"))
            try:
                payload = self.db.trace(
                    lot_code=lot_code or None,
                    receiving_log_id=receiving_log_id,
                    prod_batch_id=prod_batch_id,
                    batch_code=batch_code or None,
                    supplier_batch_no=supplier_batch_no or None,
                )
            except (ReadonlyDbError, ApiError) as exc:
                return _error(exc)
            payload.update(
                {
                    "ok": True,
                    "source": "readonly_sql",
                    "notes": [
                        "OUT movements are the dispatch record. This repository has no customer shipment table.",
                        "Signature columns are not selected.",
                    ],
                }
            )
            return payload
        try:
            return self._trace_api(
                lot_code=lot_code or None,
                receiving_log_id=receiving_log_id,
                prod_batch_id=prod_batch_id,
                batch_code=batch_code or None,
                supplier_batch_no=supplier_batch_no or None,
            )
        except ApiError as exc:
            return _error(exc)

    def list_ccp_deviations(
        self,
        date_from: str,
        date_to: str,
        limit: int | None = None,
    ) -> dict[str, Any]:
        try:
            start, end = _range(date_from, date_to, self.max_range_days, required=True)
            bounded = _limit(limit, self.default_limit, self.max_limit)
            assert start is not None and end is not None
        except ValueError as exc:
            return _error(exc)
        grouped: dict[str, list[dict[str, Any]]] = {}
        notes: list[str] = []
        truncated = False
        try:
            for name in ("cooking", "cooling", "receiving", "sanitising", "deviation"):
                spec = LOG_SPECS[name]
                scan = self._scan(spec, start, end, include_voided=False)
                truncated = truncated or scan.truncated
                notes.extend(scan.notes)
                hits = [self._present(spec, row) for row in scan.matched if _ccp_hit(name, row)]
                grouped[name] = hits[:bounded]
        except ApiError as exc:
            return _error(exc)
        return {
            "ok": True,
            "deviations": grouped,
            "truncated": truncated,
            "notes": _unique(notes + [
                "deviation rows are the CAPA / nonconformance records (there is no separate NCR table).",
                "Each group is capped at the requested limit.",
            ]),
            "source": "api",
        }

    def list_ncr(
        self,
        date_from: str | None = None,
        date_to: str | None = None,
        is_open: bool | None = None,
        severity: str | None = None,
        skip: int = 0,
        limit: int | None = None,
    ) -> dict[str, Any]:
        result = self.list_records("deviation", date_from, date_to, skip, limit, include_voided=False)
        if not result.get("ok"):
            return result
        extra_filtered = []
        for item in result["items"]:
            if is_open is True and item.get("closed_at"):
                continue
            if is_open is False and not item.get("closed_at"):
                continue
            if severity and item.get("severity") != severity:
                continue
            extra_filtered.append(item)
        if is_open is True:
            try:
                scan = self._scan(LOG_SPECS["deviation"], None, None, False, extra={"is_open": True}, first_page_only=True)
            except ApiError as exc:
                return _error(exc)
            seen = {item.get("record_id") for item in extra_filtered}
            for row in scan.matched:
                presented = self._present(LOG_SPECS["deviation"], row)
                if severity and presented.get("severity") != severity:
                    continue
                if presented.get("record_id") not in seen:
                    extra_filtered.append(presented)
        result["items"] = extra_filtered[: result["limit"]]
        result["returned"] = len(result["items"])
        result["matched"] = len(extra_filtered)
        result["log_type"] = "ncr"
        result["ncr_note"] = "NCR results are deviation_logs rows (FSP-CAPA-LOG-001). PPE capa_no is free text and is not joined."
        return result

    def get_ncr(self, record_id: int) -> dict[str, Any]:
        result = self.get_record("deviation", record_id)
        if result.get("ok"):
            result["log_type"] = "ncr"
            result["ncr_note"] = "This is a deviation / CAPA record. The schema has no separate NCR entity."
        return result

    def audit_period_summary(self, date_from: str, date_to: str) -> dict[str, Any]:
        try:
            start, end = _range(date_from, date_to, self.max_range_days, required=True)
            assert start is not None and end is not None
        except ValueError as exc:
            return _error(exc)
        try:
            activity = self._activity_summary(start, end)
        except ApiError as exc:
            if exc.status_code == 403:
                activity = {
                    "available": False,
                    "reason": "GET /api/v1/admin/activity requires an Admin service account.",
                }
            else:
                return _error(exc)
        audit_log: dict[str, Any]
        if self.db is not None and self.db.enabled:
            try:
                audit_log = {
                    "available": True,
                    "source": "readonly_sql",
                    "counts": self.db.audit_summary(start, end),
                    "note": "Counts only. old_values and new_values are not returned because they can contain signature payloads.",
                }
            except ReadonlyDbError as exc:
                audit_log = {"available": False, "reason": str(exc)}
        else:
            audit_log = {
                "available": False,
                "reason": "audit_log has no REST endpoint. Set HACCP_READONLY_DATABASE_URL to query it with the read-only role.",
            }
        return {
            "ok": True,
            "date_from": start.isoformat(),
            "date_to": end.isoformat(),
            "record_activity": activity,
            "audit_log": audit_log,
        }

    def list_label_templates(self) -> dict[str, Any]:
        try:
            payload = self.api.get_json("/api/v1/labelmaker/templates")
        except ApiError as exc:
            return _error(exc)
        rows = payload if isinstance(payload, list) else payload.get("items", [])
        return {
            "ok": True,
            "items": [_label_summary(row) for row in rows],
            "returned": len(rows),
            "note": "Recipe and ingredient text are omitted from the list. Use get_record with log_type label for one template.",
        }

    def _database_status(self) -> dict[str, Any]:
        if self.db is None or not self.db.enabled:
            return {
                "enabled": False,
                "reason": "HACCP_READONLY_DATABASE_URL is empty. Traceability and audit_log use the API where it can answer.",
            }
        try:
            return {
                "enabled": True,
                "identity": self.db.identity(),
                "visible_tables": self.db.visible_tables(),
            }
        except Exception as exc:  # connection failures stay visible and do not fall open to writes
            return {"enabled": True, "ok": False, "error": type(exc).__name__}

    def _scan(
        self,
        spec: LogSpec,
        start: date | None,
        end: date | None,
        include_voided: bool,
        extra: dict[str, Any] | None = None,
        first_page_only: bool = False,
    ) -> Scan:
        scan = Scan()
        passes = _void_passes(spec, include_voided)
        per_day = bool(spec.per_day_param and start and end and (end - start).days <= 31)
        if first_page_only and not per_day:
            scan.notes.append("No date range was supplied, so only the newest page was read.")
            for params in passes:
                body = self.api.get_json(spec.list_path, {"skip": 0, "limit": spec.page_size, **params, **(extra or {})})
                items = _items(body)
                self._take(scan, spec, items, ordered=False, start=start, end=end)
                if len(items) >= spec.page_size:
                    scan.truncated = True
            return scan
        if per_day and start and end:
            scan.notes.append(f"{spec.name} used the exact-day list filter.")
            assert spec.per_day_param is not None
            day = start
            while day <= end:
                for params in passes:
                    query = {spec.per_day_param: day.isoformat(), **params, **(extra or {})}
                    if self._walk_pages(scan, spec, query, ordered=False, start=start, end=end) == "cap":
                        return scan
                day += timedelta(days=1)
            return scan
        if spec.server_date:
            scan.notes.append(f"{spec.name} used the API date_from/date_to filter.")
            for params in passes:
                query = dict(params)
                if start:
                    query["date_from"] = start.isoformat()
                if end:
                    query["date_to"] = end.isoformat()
                query.update(extra or {})
                if self._walk_pages(scan, spec, query, ordered=False, start=start, end=end) == "cap":
                    return scan
            return scan
        scan.notes.append(
            f"{spec.name} list has no date range. Newest pages were filtered locally up to {self.max_scan} rows."
        )
        for params in passes:
            if self._walk_pages(
                scan, spec, {**params, **(extra or {})}, ordered=spec.ordered_by_date, start=start, end=end
            ) == "cap":
                return scan
        return scan

    def _walk_pages(
        self,
        scan: Scan,
        spec: LogSpec,
        params: dict[str, Any],
        *,
        ordered: bool,
        start: date | None,
        end: date | None,
    ) -> str:
        skip = 0
        while scan.scanned <= self.max_scan:
            body = self.api.get_json(spec.list_path, {"skip": skip, "limit": spec.page_size, **params})
            items = _items(body)
            outcome = self._take(scan, spec, items, ordered=ordered, start=start, end=end)
            if outcome == "cap":
                return "cap"
            if outcome == "window" or len(items) < spec.page_size:
                return "done"
            skip += len(items)
        scan.truncated = True
        return "cap"

    def _take(
        self,
        scan: Scan,
        spec: LogSpec,
        items: list[dict[str, Any]],
        *,
        ordered: bool,
        start: date | None,
        end: date | None,
    ) -> str:
        for item in items:
            scan.scanned += 1
            if scan.scanned > self.max_scan:
                scan.truncated = True
                return "cap"
            day = record_day(item, spec.date_field)
            if end and day and day > end:
                continue
            if start and day and day < start:
                if ordered:
                    return "window"
                continue
            scan.matched.append(item)
        return "next"

    def _present(self, spec: LogSpec, row: dict[str, Any]) -> dict[str, Any]:
        presented = redact(row)
        presented["log_type"] = spec.name
        presented["record_id"] = row.get(spec.id_field) or row.get("id") or row.get("batch_id")
        return presented

    def _flagged(
        self,
        spec: LogSpec,
        rows: list[dict[str, Any]],
        kinds: list[str],
        as_of: date,
        overdue_days: int,
    ) -> list[dict[str, Any]]:
        found = []
        for row in rows:
            flags = classify(spec.name, row, as_of=as_of, overdue_days=overdue_days)
            if any(matches_kind(flags, kind) for kind in kinds):
                presented = self._present(spec, row)
                presented["attention"] = flags
                found.append(presented)
        return found

    def _activity_summary(self, start: date, end: date) -> dict[str, Any]:
        # date_to is intentionally omitted. The API computes the next day with
        # datetime(year, month, day + 1), which fails on the last day of a month.
        counts: dict[str, dict[str, int]] = {}
        skip = 0
        scanned = 0
        truncated = False
        while scanned <= self.max_scan:
            body = self.api.get_json(
                "/api/v1/admin/activity",
                {"skip": skip, "limit": 200, "date_from": start.isoformat()},
            )
            items = _items(body)
            stop = False
            for item in items:
                scanned += 1
                if scanned > self.max_scan:
                    truncated = True
                    stop = True
                    break
                day = record_day(item, "created_at")
                if day and day > end:
                    continue
                if day and day < start:
                    stop = True
                    break
                bucket = counts.setdefault(str(item.get("module")), {"created": 0, "locked": 0, "voided": 0})
                bucket["created"] += 1
                if item.get("is_locked"):
                    bucket["locked"] += 1
                if item.get("is_voided"):
                    bucket["voided"] += 1
            if stop or len(items) < 200:
                break
            skip += len(items)
        return {
            "available": True,
            "source": "GET /api/v1/admin/activity",
            "by_module": counts,
            "scanned": scanned,
            "truncated": truncated,
            "note": (
                "This is a creation feed. It does not include cleaning checklists or audit_log changes. "
                "date_to is applied locally because the API date_to parameter crashes on the last day of a month."
            ),
        }

    def _trace_api(
        self,
        *,
        lot_code: str | None,
        receiving_log_id: int | None,
        prod_batch_id: int | None,
        batch_code: str | None,
        supplier_batch_no: str | None,
    ) -> dict[str, Any]:
        notes = [
            "Lot code, supplier batch, and batch code searches scan newest pages because those list APIs have no exact filter.",
            "OUT stock movements are the dispatch record. There is no shipment table.",
        ]
        truncated = False
        lots: list[dict[str, Any]] = []
        if lot_code:
            found, hit_cap = self._find_pages(
                "/api/v1/inventory/lots",
                {},
                lambda row: row.get("lot_code") == lot_code,
                page_size=200,
                max_pages=10,
            )
            lots.extend(found)
            truncated = truncated or hit_cap
        receiving: list[dict[str, Any]] = []
        if receiving_log_id:
            row = self._get_optional(f"/api/v1/receiving-logs/{int(receiving_log_id)}")
            if row:
                receiving.append(row)
        if supplier_batch_no:
            found, hit_cap = self._find_pages(
                "/api/v1/receiving-logs",
                {"is_voided": False},
                lambda row: row.get("supplier_batch_no") == supplier_batch_no,
                page_size=100,
                max_pages=10,
            )
            receiving.extend(found)
            truncated = truncated or hit_cap
        batches: list[dict[str, Any]] = []
        if prod_batch_id:
            row = self._get_optional(f"/api/v1/production/batches/{int(prod_batch_id)}")
            if row:
                batches.append(row)
        if batch_code:
            found, hit_cap = self._find_pages(
                "/api/v1/production/batches",
                {"include_voided": True},
                lambda row: row.get("batch_code") == batch_code,
                page_size=100,
                max_pages=10,
            )
            batches.extend(found)
            truncated = truncated or hit_cap
        for lot in list(lots):
            if lot.get("receiving_log_id") and not _has_id(receiving, lot["receiving_log_id"]):
                row = self._get_optional(f"/api/v1/receiving-logs/{lot['receiving_log_id']}")
                if row:
                    receiving.append(row)
            if lot.get("prod_batch_id") and not _has_id(batches, lot["prod_batch_id"]):
                row = self._get_optional(f"/api/v1/production/batches/{lot['prod_batch_id']}")
                if row:
                    batches.append(row)
        documents = []
        for record in receiving + batches:
            for key in ("inv_stock_doc_id", "input_stock_doc_id"):
                doc_id = record.get(key)
                if doc_id and not _has_id(documents, doc_id):
                    document = self._get_optional(f"/api/v1/inventory/docs/{doc_id}")
                    if document:
                        documents.append(document)
        movements: list[dict[str, Any]] = []
        lot_ids = {lot.get("id") for lot in lots}
        for item_id in list({lot.get("item_id") for lot in lots if lot.get("item_id")})[:5]:
            rows, hit_cap = self._collect_pages(
                "/api/v1/inventory/balance/movements",
                {"item_id": item_id},
                page_size=200,
                max_pages=5,
            )
            movements.extend(row for row in rows if row.get("lot_id") in lot_ids)
            truncated = truncated or hit_cap
        linked: dict[str, Any] = {}
        for batch in batches:
            batch_id = batch.get("id")
            if not batch_id:
                continue
            linked[str(batch_id)] = {
                "cooking": self._linked(LOG_SPECS["cooking"], batch_id),
                "cooling": self._linked(LOG_SPECS["cooling"], batch_id),
                "mixing": self._linked(LOG_SPECS["mixing"], batch_id),
                "assembly": self._linked(LOG_SPECS["assembly"], batch_id),
            }
        return redact(
            {
                "ok": True,
                "source": "api",
                "truncated": truncated,
                "lots": lots,
                "receiving": receiving,
                "batches": batches,
                "stock_documents": documents,
                "movements": movements,
                "linked_logs": linked,
                "notes": notes,
            }
        )

    def _linked(self, spec: LogSpec, batch_id: int) -> list[dict[str, Any]]:
        body = self.api.get_json(spec.list_path, {"prod_batch_id": batch_id, "limit": spec.page_size, "is_voided": False})
        return [self._present(spec, row) for row in _items(body)]

    def _find_pages(self, path, params, predicate, *, page_size, max_pages):
        rows, truncated = self._collect_pages(path, params, page_size=page_size, max_pages=max_pages)
        return [row for row in rows if predicate(row)], truncated

    def _collect_pages(self, path, params, *, page_size, max_pages):
        rows: list[dict[str, Any]] = []
        skip = 0
        for page in range(max_pages):
            body = self.api.get_json(path, {"skip": skip, "limit": page_size, **params})
            items = _items(body)
            rows.extend(items)
            if len(items) < page_size:
                return rows, False
            skip += len(items)
            if page == max_pages - 1:
                return rows, True
        return rows, True

    def _get_optional(self, path: str) -> Any:
        try:
            return self.api.get_json(path)
        except ApiError as exc:
            if exc.status_code == 404:
                return None
            raise

    def _get_label(self, record_id: int) -> dict[str, Any]:
        try:
            payload = self._get_optional(f"/api/v1/labelmaker/templates/{int(record_id)}")
        except ApiError as exc:
            return _error(exc)
        if payload is None:
            return {"ok": False, "error": f"label {record_id} was not found", "status": 404}
        summary = _label_summary(payload)
        ingredients = payload.get("ingredients") or []
        summary["ingredients"] = [
            {"name": item.get("name"), "allergen_tags": item.get("allergenTags") or []}
            for item in ingredients
            if isinstance(item, dict)
        ]
        recipe = payload.get("recipe")
        summary["recipe"] = recipe if _rough_size(recipe) <= 20000 else {"redacted": True, "reason": "recipe payload is too large"}
        return {"ok": True, "log_type": "label", "record": summary}


def _spec(log_type: str) -> LogSpec | dict[str, Any]:
    spec = LOG_SPECS.get(log_type)
    if spec is None:
        return _error(ValueError(f"unknown log_type '{log_type}'"))
    return spec


def _range(date_from: str | None, date_to: str | None, max_days: int, *, required: bool) -> tuple[date | None, date | None]:
    start = date.fromisoformat(date_from) if date_from else None
    end = date.fromisoformat(date_to) if date_to else None
    if required and (start is None or end is None):
        raise ValueError("date_from and date_to are required")
    if start and end and end < start:
        raise ValueError("date_to is before date_from")
    if start and end and (end - start).days > max_days:
        raise ValueError(f"date range exceeds {max_days} days")
    return start, end


def _limit(limit: int | None, default: int, maximum: int) -> int:
    if limit is None:
        return default
    value = int(limit)
    if value < 1:
        raise ValueError("limit must be at least 1")
    return min(value, maximum)


def _void_passes(spec: LogSpec, include_voided: bool) -> list[dict[str, Any]]:
    if spec.void_mode == "none" or spec.list_params is None:
        return [{}]
    if spec.void_mode == "include":
        return [spec.list_params(include_voided)]
    if include_voided:
        return [spec.list_params(False), spec.list_params(True)]
    return [spec.list_params(False)]


def _items(body: Any) -> list[dict[str, Any]]:
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        items = body.get("items") or []
        return items if isinstance(items, list) else []
    return []


def _ccp_hit(log_type: str, record: dict[str, Any]) -> bool:
    if log_type in {"cooking", "cooling"}:
        return record.get("ccp_status") in {"Fail", "Deviation"}
    if log_type == "receiving":
        return record.get("acceptance_status") in {"Reject", "Hold"} or record.get("vehicle_cleanliness") == "Fail" or record.get("packaging_integrity") == "Fail"
    if log_type == "sanitising":
        return record.get("atp_status") == "Fail"
    return log_type == "deviation"


def _label_summary(row: dict[str, Any]) -> dict[str, Any]:
    ingredients = row.get("ingredients") or []
    tags: set[str] = set()
    for item in ingredients:
        if isinstance(item, dict):
            for tag in item.get("allergenTags") or []:
                tags.add(str(tag))
    return {
        "id": row.get("id"),
        "record_id": row.get("id"),
        "log_type": "label",
        "prod_product_id": row.get("prod_product_id"),
        "product_code": row.get("product_code"),
        "product_name_en": row.get("product_name_en"),
        "product_name_zh": row.get("product_name_zh"),
        "pack_type_code": row.get("pack_type_code"),
        "net_weight_g": row.get("net_weight_g"),
        "shelf_life_days": row.get("shelf_life_days"),
        "ingredient_count": len(ingredients) if isinstance(ingredients, list) else 0,
        "allergen_tags": sorted(tags),
        "has_recipe": bool(row.get("recipe")),
        "allergens_confirmed_at": row.get("allergens_confirmed_at"),
        "updated_at": row.get("updated_at"),
    }


def _has_id(rows: list[dict[str, Any]], value: Any) -> bool:
    return any(row.get("id") == value for row in rows)


def _dedupe_findings(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, Any]] = set()
    unique = []
    for item in items:
        key = (item.get("log_type"), item.get("record_id"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def _unique(items: list[str]) -> list[str]:
    result: list[str] = []
    for item in items:
        if item not in result:
            result.append(item)
    return result


def _rough_size(value: Any) -> int:
    return len(str(value)) if value is not None else 0


def _error(exc: Exception) -> dict[str, Any]:
    status = getattr(exc, "status_code", None)
    payload: dict[str, Any] = {"ok": False, "error": str(exc)}
    if status is not None:
        payload["status"] = status
    return payload
