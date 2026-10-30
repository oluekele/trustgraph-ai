from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from trustgraph.common import utc_now


class AuditEventType(StrEnum):
    AUTHORIZATION = "authorization"
    EXECUTION = "execution"
    DELEGATION_CREATED = "delegation.created"
    DELEGATION_REJECTED = "delegation.rejected"
    DELEGATION_REVOKED = "delegation.revoked"
    GRANT_CREATED = "grant.created"
    GRANT_REVOKED = "grant.revoked"
    PRINCIPAL_REGISTERED = "principal.registered"
    PRINCIPAL_STATUS = "principal.status"
    POLICY_CHANGED = "policy.changed"
    APPROVAL_REQUESTED = "approval.requested"
    APPROVAL_DECIDED = "approval.decided"


class AuditEvent(BaseModel):
    """Tamper-evident governance record.

    Events form a hash chain: ``hash = sha256(prev_hash + canonical(event))``,
    so altering or deleting any stored event breaks verification.
    """

    id: str
    sequence: int = 0
    timestamp: datetime = Field(default_factory=utc_now)
    event_type: AuditEventType
    actor_id: str
    on_behalf_of: str | None = None
    delegation_chain: list[str] = Field(default_factory=list)
    principal_chain: list[str] = Field(default_factory=list)
    request_id: str | None = None
    tool_name: str | None = None
    capability: str | None = None
    resource: str | None = None
    action: str | None = None
    purpose: str | None = None
    decision: str | None = None
    reason: str = ""
    policy_ids: list[str] = Field(default_factory=list)
    risk_score: float | None = None
    risk_level: str | None = None
    risk_factors: dict[str, float] | None = None
    execution_status: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    prev_hash: str = ""
    hash: str = ""

    def hash_payload(self) -> dict[str, Any]:
        return self.model_dump(mode="json", exclude={"hash"})


class AuditVerification(BaseModel):
    valid: bool
    events_checked: int
    first_invalid_sequence: int | None = None
    detail: str
