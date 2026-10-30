"""Small helpers shared across TrustGraph modules."""

import hashlib
import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: datetime | None) -> datetime | None:
    """Treat naive datetimes (e.g. from SQLite) as UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


def canonical_json(value: Any) -> str:
    """Deterministic JSON used for fingerprints and audit hashes."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def min_datetime(*values: datetime | None) -> datetime | None:
    present = [ensure_utc(value) for value in values if value is not None]
    return min(present) if present else None
