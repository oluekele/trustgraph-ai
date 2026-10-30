"""HTTP request bodies for the governance API."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from trustgraph.authorization.models import RequestContext
from trustgraph.identity.models import PrincipalKind, PrincipalStatus


class PrincipalCreate(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9._-]{1,62}$")
    kind: PrincipalKind
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    owner_id: str | None = None
    parent_agent_id: str | None = None
    capabilities: list[str] = Field(default_factory=list)


class StatusUpdate(BaseModel):
    status: PrincipalStatus


class GrantCreate(BaseModel):
    principal_id: str
    capability: str
    resource: str
    action: str
    max_delegation_depth: int = Field(default=0, ge=0, le=10)
    expires_at: datetime | None = None


class RevokeBody(BaseModel):
    reason: str = Field(default="Revoked by operator.", max_length=500)


class AuthorizeBody(BaseModel):
    agent_id: str
    capability: str
    resource: str
    action: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    context: RequestContext = Field(default_factory=RequestContext)
    approval_id: str | None = None


class ExecuteBody(BaseModel):
    agent_id: str
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    context: RequestContext = Field(default_factory=RequestContext)
    approval_id: str | None = None


class ApprovalDecisionBody(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class AgentRunBody(BaseModel):
    task: str = Field(min_length=1, max_length=4000)
    purpose: str | None = None
    planner: Literal["auto", "scripted", "gemini", "openai", "grok"] = "auto"
    max_steps: int = Field(default=6, ge=1, le=20)
    script: list[dict[str, Any]] | None = Field(
        default=None,
        description="Steps for the scripted planner: [{'tool': ..., 'arguments': {...}}].",
    )


class EvaluationRunBody(BaseModel):
    repetitions: int = Field(default=20, ge=1, le=500)
