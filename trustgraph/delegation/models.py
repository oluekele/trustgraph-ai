from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from trustgraph.capability.models import Permission
from trustgraph.common import ensure_utc, utc_now


class DelegationStatus(StrEnum):
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"


class Delegation(BaseModel):
    """A grant of a subset of the delegator's authority to an agent.

    ``max_redelegation_depth`` is how many further hops the delegatee may
    pass this authority on (``0`` = it may use but not re-delegate).
    """

    id: str
    delegator_id: str
    delegatee_id: str
    grants: list[Permission]
    purpose: str = ""
    max_redelegation_depth: int = Field(default=0, ge=0, le=10)
    parent_delegation_id: str | None = None
    depth: int = 1
    status: DelegationStatus = DelegationStatus.ACTIVE
    created_by: str = "system"
    created_at: datetime = Field(default_factory=utc_now)
    expires_at: datetime | None = None
    revoked_at: datetime | None = None
    revoked_reason: str | None = None

    def is_valid(self, now: datetime) -> bool:
        if self.status != DelegationStatus.ACTIVE:
            return False
        expires = ensure_utc(self.expires_at)
        return expires is None or expires > now

    def effective_status(self, now: datetime) -> DelegationStatus:
        if self.status == DelegationStatus.ACTIVE and not self.is_valid(now):
            return DelegationStatus.EXPIRED
        return self.status


class DelegationRequest(BaseModel):
    delegator_id: str
    delegatee_id: str
    grants: list[Permission] = Field(min_length=1)
    purpose: str = ""
    max_redelegation_depth: int = Field(default=0, ge=0, le=10)
    expires_at: datetime | None = None


class DelegationResult(BaseModel):
    accepted: bool
    reason: str
    violations: list[str] = Field(default_factory=list)
    delegation: Delegation | None = None
