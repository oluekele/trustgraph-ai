from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from trustgraph.common import utc_now


class PolicyEffect(StrEnum):
    ALLOW = "allow"
    REQUIRE_APPROVAL = "require_approval"
    DENY = "deny"


class PolicyConditions(BaseModel):
    """Constraints that must hold for an ALLOW / REQUIRE_APPROVAL policy to apply."""

    require_purpose: bool = False
    max_risk_score: float | None = Field(default=None, ge=0, le=100)
    max_delegation_hops: int | None = Field(default=None, ge=0)
    direct_authority_only: bool = False
    allowed_hours_utc: tuple[int, int] | None = None  # [start, end) in hours

    def is_empty(self) -> bool:
        return self == PolicyConditions()


class Policy(BaseModel):
    """Organisational rule evaluated after authority has been established.

    Policies never create authority; they constrain how existing authority
    may be used. Empty match lists mean "any". Resource patterns accept
    shell-style wildcards (``file:///hr/*``).
    """

    id: str
    name: str
    description: str = ""
    effect: PolicyEffect = PolicyEffect.ALLOW
    priority: int = 100
    subjects: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    resources: list[str] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)
    conditions: PolicyConditions = Field(default_factory=PolicyConditions)
    enabled: bool = True
    version: int = 1
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class PolicyEvaluation(BaseModel):
    """Outcome of policy evaluation for one request."""

    effect: PolicyEffect | None
    reason: str
    matched: list[str] = Field(default_factory=list)
    applied: list[str] = Field(default_factory=list)
    failed_conditions: list[str] = Field(default_factory=list)
