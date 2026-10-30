from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from trustgraph.capability.models import Permission
from trustgraph.common import canonical_json, new_id, sha256_hex, utc_now
from trustgraph.delegation.provenance import AuthorityPath
from trustgraph.risk.models import RiskAssessment


class Decision(StrEnum):
    ALLOW = "allow"
    RESTRICT = "restrict"
    REQUIRE_APPROVAL = "require_approval"
    DENY = "deny"

    @property
    def severity(self) -> int:
        return _SEVERITY[self]

    @property
    def permits_execution(self) -> bool:
        return self in (Decision.ALLOW, Decision.RESTRICT)

    @staticmethod
    def most_restrictive(*decisions: "Decision") -> "Decision":
        return max(decisions, key=lambda decision: decision.severity)


_SEVERITY = {
    Decision.ALLOW: 0,
    Decision.RESTRICT: 1,
    Decision.REQUIRE_APPROVAL: 2,
    Decision.DENY: 3,
}


class RequestContext(BaseModel):
    """Runtime context supplied with a request.

    ``untrusted_input`` is set by the agent runtime once the agent has
    ingested content it does not control (web pages, files, tool output),
    which is the precondition for indirect prompt injection.
    """

    purpose: str | None = None
    untrusted_input: bool = False
    session_id: str | None = None
    source: str = "agent"
    attributes: dict[str, Any] = Field(default_factory=dict)


class AuthorizationRequest(BaseModel):
    request_id: str = Field(default_factory=lambda: new_id("req"))
    agent_id: str
    capability: str
    resource: str
    action: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    context: RequestContext = Field(default_factory=RequestContext)
    tool_name: str | None = None
    approval_id: str | None = None
    # Identity proven by the caller's credential. When set it must equal
    # ``agent_id``; this blocks one agent acting under another's identity.
    authenticated_principal_id: str | None = None

    @property
    def permission(self) -> Permission:
        return Permission(capability=self.capability, resource=self.resource, action=self.action)

    def fingerprint(self) -> str:
        """Binds a human approval to exactly this action."""
        return sha256_hex(
            canonical_json(
                {
                    "agent": self.agent_id,
                    "capability": self.capability,
                    "resource": self.resource,
                    "action": self.action,
                    "arguments": self.arguments,
                    "purpose": self.context.purpose,
                }
            )
        )


class TraceStep(BaseModel):
    step: str
    outcome: str  # pass | fail | warn | info
    detail: str


class AuthorizationDecision(BaseModel):
    request_id: str
    decision: Decision
    reason: str
    agent_id: str
    capability: str
    resource: str
    action: str
    on_behalf_of: str | None = None
    authority_path: AuthorityPath | None = None
    matched_policies: list[str] = Field(default_factory=list)
    risk: RiskAssessment | None = None
    restrictions: dict[str, Any] = Field(default_factory=dict)
    approval_id: str | None = None
    approved_by: str | None = None
    trace: list[TraceStep] = Field(default_factory=list)
    fingerprint: str = ""
    latency_ms: float = 0.0
    evaluated_at: datetime = Field(default_factory=utc_now)
