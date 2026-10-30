from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from trustgraph.common import ensure_utc, utc_now


class ApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CONSUMED = "consumed"


class ApprovalRequest(BaseModel):
    """A pending human decision bound to one exact action (by fingerprint)."""

    id: str
    fingerprint: str
    agent_id: str
    capability: str
    resource: str
    action: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    purpose: str | None = None
    tool_name: str | None = None
    risk_score: float | None = None
    risk_level: str | None = None
    reason: str = ""
    status: ApprovalStatus = ApprovalStatus.PENDING
    requested_at: datetime = Field(default_factory=utc_now)
    expires_at: datetime
    decided_by: str | None = None
    decided_at: datetime | None = None
    decision_note: str | None = None
    consumed_at: datetime | None = None

    def effective_status(self, now: datetime) -> ApprovalStatus:
        if self.status in (ApprovalStatus.PENDING, ApprovalStatus.APPROVED):
            if ensure_utc(self.expires_at) <= now:
                return ApprovalStatus.EXPIRED
        return self.status
