from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from trustgraph.common import utc_now


class PrincipalKind(StrEnum):
    USER = "user"
    AGENT = "agent"


class PrincipalStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DECOMMISSIONED = "decommissioned"


class Principal(BaseModel):
    """A human user or an AI agent known to TrustGraph.

    Identity is deliberately separate from authorisation: a registered,
    active agent holds *technical capabilities* (the tools it can drive)
    but no authority until grants or delegations give it some.
    """

    id: str
    kind: PrincipalKind
    name: str
    description: str = ""
    owner_id: str | None = None
    parent_agent_id: str | None = None
    status: PrincipalStatus = PrincipalStatus.ACTIVE
    capabilities: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)

    @property
    def is_active(self) -> bool:
        return self.status == PrincipalStatus.ACTIVE

    @property
    def is_agent(self) -> bool:
        return self.kind == PrincipalKind.AGENT

    def has_capability(self, capability: str) -> bool:
        return capability in self.capabilities


# Backwards-compatible name used in the proposal's class list.
AgentIdentity = Principal
