"""Governed agent loop.

The planner (LLM or deterministic) reasons and proposes tool calls; each
proposal is submitted to the TrustGraph ``RuntimeEnforcer``. The agent holds
no tool implementations and cannot authorise itself (proposal §25).
"""

import json
from typing import Any, Callable

from pydantic import BaseModel, Field

from ai_agent.providers.base_provider import Planner
from ai_agent.providers.provider_manager import build_planner
from ai_agent.providers.tool_call import Observation
from ai_agent.tools.schema import ToolSpec
from trustgraph.authorization.models import RequestContext
from trustgraph.authorization.runtime import RuntimeEnforcer
from trustgraph.common import new_id

MAX_OUTPUT_CHARS = 2000

__all__ = ["AgentRun", "AgentRuntime", "AgentStep", "build_planner"]


class AgentStep(BaseModel):
    index: int
    tool: str
    arguments: dict[str, Any]
    thought: str | None = None
    status: str
    decision: str
    reason: str
    request_id: str
    risk_score: float | None = None
    risk_level: str | None = None
    approval_id: str | None = None
    untrusted_context: bool = False
    output: Any = None


class AgentRun(BaseModel):
    run_id: str = Field(default_factory=lambda: new_id("run"))
    agent_id: str
    planner: str
    task: str
    purpose: str | None
    steps: list[AgentStep] = Field(default_factory=list)
    final_answer: str | None = None
    stopped_reason: str = "completed"
    error: str | None = None


def _truncate(value: Any) -> Any:
    text = json.dumps(value, default=str)
    if len(text) <= MAX_OUTPUT_CHARS:
        return value
    return text[:MAX_OUTPUT_CHARS] + "…"


class AgentRuntime:
    def __init__(
        self,
        enforcer: RuntimeEnforcer,
        agent_id: str,
        planner: Planner,
        tool_specs: list[ToolSpec],
        session_id: str | None = None,
    ):
        self.enforcer = enforcer
        self.agent_id = agent_id
        self.planner = planner
        self.tool_specs = tool_specs
        self.session_id = session_id or new_id("sess")

    def run(
        self,
        task: str,
        purpose: str | None = None,
        max_steps: int = 6,
        on_step: Callable[[], None] | None = None,
    ) -> AgentRun:
        run = AgentRun(agent_id=self.agent_id, planner=self.planner.name(), task=task, purpose=purpose)
        observations: list[Observation] = []
        tainted = False
        specs = {spec.name: spec for spec in self.tool_specs}

        for index in range(max_steps):
            try:
                step = self.planner.next_step(task, observations, self.tool_specs)
            except Exception as exc:
                run.stopped_reason = "planner_error"
                run.error = f"{type(exc).__name__}: {exc}"
                return run

            if step.kind == "final" or step.tool_call is None:
                run.final_answer = step.text
                return run

            call = step.tool_call
            context = RequestContext(
                purpose=purpose,
                untrusted_input=tainted,
                session_id=self.session_id,
                source=f"agent-runtime:{self.planner.name()}",
            )
            result = self.enforcer.execute(self.agent_id, call.name, call.arguments, context)
            decision = result.decision
            observation = Observation(
                tool=call.name,
                arguments=call.arguments,
                call_id=call.call_id,
                status=result.status.value,
                decision=decision.decision.value,
                reason=result.error or decision.reason,
                output=_truncate(result.output) if result.executed else None,
                approval_id=decision.approval_id,
            )
            observations.append(observation)
            run.steps.append(
                AgentStep(
                    index=index,
                    tool=call.name,
                    arguments=call.arguments,
                    thought=step.thought,
                    status=observation.status,
                    decision=observation.decision,
                    reason=observation.reason,
                    request_id=result.request_id,
                    risk_score=decision.risk.score if decision.risk else None,
                    risk_level=decision.risk.level.value if decision.risk else None,
                    approval_id=decision.approval_id,
                    untrusted_context=tainted,
                    output=observation.output,
                )
            )
            # Content the agent does not control taints the rest of the session.
            spec = specs.get(call.name)
            if result.executed and spec is not None and "untrusted-output" in spec.tags:
                tainted = True
            if on_step:
                on_step()

        run.stopped_reason = "max_steps"
        return run
