from typing import Any, Literal

from pydantic import BaseModel, Field


class ToolCall(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    call_id: str | None = None


class PlannerStep(BaseModel):
    """What the agent wants to do next: call a tool, or finish."""

    kind: Literal["tool", "final"]
    tool_call: ToolCall | None = None
    text: str | None = None
    thought: str | None = None


class Observation(BaseModel):
    """Result of a governed tool call, as fed back to the planner."""

    tool: str
    arguments: dict[str, Any]
    call_id: str | None = None
    status: str
    decision: str
    reason: str
    output: Any = None
    approval_id: str | None = None

    def for_model(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"status": self.status, "governance_decision": self.decision, "reason": self.reason}
        if self.output is not None:
            payload["output"] = self.output
        if self.approval_id:
            payload["approval_id"] = self.approval_id
            payload["note"] = "A human must approve this exact action before it can run."
        return payload
