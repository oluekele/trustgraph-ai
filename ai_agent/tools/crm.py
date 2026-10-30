"""Synthetic CRM database tools."""

from typing import Any

from ai_agent.tools.sandbox import Sandbox

PII_FIELDS = ("email", "phone")


def _table(sandbox: Sandbox, arguments: dict[str, Any]) -> list[dict[str, Any]]:
    table = arguments.get("table", "customers")
    if table not in sandbox.tables:
        raise ValueError(f"Unknown table '{table}'.")
    return sandbox.tables[table]


def crm_query(sandbox: Sandbox, arguments: dict[str, Any], restrictions: dict[str, Any]) -> dict:
    rows = _table(sandbox, arguments)
    filters = arguments.get("filters") or {}
    matched = [row for row in rows if all(str(row.get(k)) == str(v) for k, v in filters.items())]
    limit = int(arguments.get("limit", 20))
    if "max_records" in restrictions:
        limit = min(limit, int(restrictions["max_records"]))
    result = [dict(row) for row in matched[:limit]]
    if restrictions.get("redact_pii"):
        for row in result:
            for field in PII_FIELDS:
                if field in row:
                    row[field] = "[redacted]"
    return {"rows": result, "total_matched": len(matched), "restricted": bool(restrictions)}


def crm_update(sandbox: Sandbox, arguments: dict[str, Any], restrictions: dict[str, Any]) -> dict:
    rows = _table(sandbox, arguments)
    ids = arguments.get("record_ids") or []
    if isinstance(ids, str):
        ids = [ids]
    limit = int(restrictions.get("max_affected_records", len(ids)))
    changes = {k: v for k, v in (arguments.get("changes") or {}).items() if k != "id"}
    updated = []
    for row in rows:
        if row["id"] in ids[:limit]:
            row.update(changes)
            updated.append(row["id"])
    return {"updated": updated, "skipped_by_restriction": ids[limit:]}


def crm_delete(sandbox: Sandbox, arguments: dict[str, Any], restrictions: dict[str, Any]) -> dict:
    table = arguments.get("table", "customers")
    rows = _table(sandbox, arguments)
    ids = arguments.get("record_ids") or []
    if isinstance(ids, str):
        ids = [ids]
    limit = int(restrictions.get("max_affected_records", len(ids)))
    targets = set(ids[:limit])
    sandbox.tables[table] = [row for row in rows if row["id"] not in targets]
    return {"deleted": sorted(targets), "skipped_by_restriction": ids[limit:]}
