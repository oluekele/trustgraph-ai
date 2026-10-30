"""The two experimental conditions behind one interface.

Each case runs against a freshly seeded, isolated world (in-memory SQLite
and its own synthetic sandbox), so cases cannot influence one another.
"""

import copy
from dataclasses import dataclass, field
from datetime import timedelta
from time import perf_counter
from typing import Any, Literal

from ai_agent.providers.local_tool_provider import NaiveInstructionFollowingPlanner
from ai_agent.runtime import AgentRuntime
from ai_agent.tools.registry import TicketAuthority, ToolBypassError, ToolRegistry
from trustgraph.authorization.models import AuthorizationDecision, Decision, RequestContext
from trustgraph.authorization.runtime import ExecutionResult, ExecutionStatus
from trustgraph.baseline.rbac import StaticRBAC
from trustgraph.capability.models import Permission
from trustgraph.common import new_id, utc_now
from trustgraph.delegation.models import DelegationRequest
from trustgraph.identity.models import PrincipalStatus
from trustgraph.persistence.database import create_database_engine, create_schema, make_session_factory
from trustgraph.policy.models import Policy
from trustgraph.risk.models import RiskConfig
from trustgraph.seed import seed_world
from trustgraph.service import TrustGraph

Outcome = Literal["executed", "escalated", "blocked"]


@dataclass
class StepResult:
    outcome: Outcome
    decision: str
    reason: str
    latency_ms: float
    end_to_end_ms: float
    request_id: str | None = None
    approval_id: str | None = None
    created_id: str | None = None
    raw: Any = None


def _from_execution(result: ExecutionResult, elapsed_ms: float) -> StepResult:
    mapping = {
        ExecutionStatus.EXECUTED: "executed",
        ExecutionStatus.RESTRICTED: "executed",
        ExecutionStatus.FAILED: "executed",  # governance permitted it; the tool itself errored
        ExecutionStatus.PENDING_APPROVAL: "escalated",
        ExecutionStatus.BLOCKED: "blocked",
    }
    return StepResult(
        outcome=mapping[result.status],
        decision=result.decision.decision.value,
        reason=result.error or result.decision.reason,
        latency_ms=result.decision.latency_ms,
        end_to_end_ms=elapsed_ms,
        request_id=result.request_id,
        approval_id=result.decision.approval_id,
        raw=result,
    )


# ---------------------------------------------------------------- TrustGraph

_TEMPLATE: tuple[Any, dict[str, str]] | None = None
_BASELINE_TEMPLATE: tuple[StaticRBAC, dict[str, str]] | None = None


def _template() -> tuple[Any, dict[str, str]]:
    """Seed the experimental world once; every case starts from a copy of it."""
    global _TEMPLATE
    if _TEMPLATE is None:
        engine = create_database_engine("sqlite://")
        create_schema(engine)
        with make_session_factory(engine)() as session:
            seeded = seed_world(TrustGraph(session, tools=ToolRegistry(TicketAuthority("template"))))
        _TEMPLATE = (engine, dict(seeded["delegations"]))
    return _TEMPLATE



@dataclass
class TrustGraphSystem:
    tg: TrustGraph
    delegation_ids: dict[str, str]
    name: str = "trustgraph"
    request_ids: list[str] = field(default_factory=list)

    @classmethod
    def build(cls, risk_config: RiskConfig | None = None) -> "TrustGraphSystem":
        template, delegation_ids = _template()
        engine = create_database_engine("sqlite://")
        source = template.raw_connection()
        target = engine.raw_connection()
        try:
            # Clone the seeded template database (identical starting state per case).
            source.driver_connection.backup(target.driver_connection)
        finally:
            source.close()
            target.close()
        session = make_session_factory(engine)()
        tools = ToolRegistry(TicketAuthority(new_id("secret")))
        tg = TrustGraph(session, risk_config=risk_config, tools=tools)
        return cls(tg=tg, delegation_ids=dict(delegation_ids))

    def act(
        self,
        agent: str,
        tool: str,
        arguments: dict[str, Any],
        purpose: str | None = None,
        untrusted: bool = False,
        approval_id: str | None = None,
        authenticated: str | None = None,
    ) -> StepResult:
        started = perf_counter()
        result = self.tg.enforcer.execute(
            agent,
            tool,
            arguments,
            RequestContext(purpose=purpose, untrusted_input=untrusted, source="evaluation"),
            approval_id=approval_id,
            authenticated_principal_id=authenticated,
        )
        self.tg.commit()
        self.request_ids.append(result.request_id)
        return _from_execution(result, (perf_counter() - started) * 1000)

    def delegate(self, delegator: str, delegatee: str, grants: list[Permission], depth: int = 0) -> StepResult:
        started = perf_counter()
        result = self.tg.delegations.create_delegation(
            DelegationRequest(
                delegator_id=delegator,
                delegatee_id=delegatee,
                grants=grants,
                purpose="evaluation",
                max_redelegation_depth=depth,
            )
        )
        self.tg.commit()
        elapsed = (perf_counter() - started) * 1000
        return StepResult(
            outcome="executed" if result.accepted else "blocked",
            decision="allow" if result.accepted else "deny",
            reason=result.reason,
            latency_ms=elapsed,
            end_to_end_ms=elapsed,
            created_id=result.delegation.id if result.delegation else None,
        )

    def revoke(self, key: str, delegatee: str) -> None:
        self.tg.delegations.revoke_delegation(self.delegation_ids.get(key, key), revoked_by="evaluation")
        self.tg.commit()

    def expire(self, key: str) -> None:
        delegation = self.tg.repository.get_delegation(self.delegation_ids.get(key, key))
        self.tg.repository.update_delegation(
            delegation.model_copy(update={"expires_at": utc_now() - timedelta(minutes=1)})
        )
        self.tg.commit()

    def suspend(self, agent: str) -> None:
        self.tg.identity.set_status(agent, PrincipalStatus.SUSPENDED, actor_id="evaluation")
        self.tg.commit()

    def grant(self, principal: str, permission: Permission, depth: int = 0) -> None:
        self.tg.direct_authority.grant(principal, permission, max_delegation_depth=depth, granted_by="evaluation")
        self.tg.commit()

    def add_policy(self, policy: Policy) -> None:
        self.tg.repository.upsert_policy(policy)
        self.tg.commit()

    def approve(self, approval_id: str) -> None:
        self.tg.approvals.decide(approval_id, True, "u-bayo", "evaluation approval")
        self.tg.commit()

    def bypass(self, tool: str, arguments: dict[str, Any]) -> StepResult:
        """Invoke a protected tool directly with a forged ticket (no governance)."""
        started = perf_counter()
        try:
            self.tg.tools.protected(tool).invoke("forged-ticket", new_id("req"), "forged", arguments, {})
            outcome, reason = "executed", "Tool ran without a governance decision."
        except ToolBypassError as exc:
            outcome, reason = "blocked", str(exc)
        elapsed = (perf_counter() - started) * 1000
        return StepResult(outcome, "n/a", reason, elapsed, elapsed)

    def agent_run(self, agent: str, task: str, purpose: str | None) -> list[StepResult]:
        runtime = AgentRuntime(self.tg.enforcer, agent, NaiveInstructionFollowingPlanner(), self.tg.tools.specs())
        run = runtime.run(task, purpose=purpose, max_steps=8, on_step=self.tg.commit)
        self.tg.commit()
        results = []
        for step in run.steps:
            self.request_ids.append(step.request_id)
            outcome = {"executed": "executed", "restricted": "executed", "failed": "executed",
                       "pending_approval": "escalated"}.get(step.status, "blocked")
            results.append(StepResult(outcome, step.decision, step.reason, 0.0, 0.0,
                                      request_id=step.request_id, raw=step))
        return results


# ------------------------------------------------------------------ Baseline


class BaselineEnforcer:
    """Adapts StaticRBAC to the RuntimeEnforcer interface used by AgentRuntime."""

    def __init__(self, rbac: StaticRBAC):
        self.rbac = rbac

    def execute(self, agent_id, tool_name, arguments, context=None, approval_id=None,
                authenticated_principal_id=None) -> ExecutionResult:
        result = self.rbac.execute(agent_id, tool_name, arguments, authenticated_principal_id)
        status = {"executed": ExecutionStatus.EXECUTED, "failed": ExecutionStatus.FAILED}.get(
            result.status, ExecutionStatus.BLOCKED
        )
        decision = AuthorizationDecision(
            request_id=new_id("base"),
            decision=Decision.ALLOW if result.decision.allowed else Decision.DENY,
            reason=result.decision.reason,
            agent_id=agent_id,
            capability="",
            resource="",
            action="",
            latency_ms=result.decision.latency_ms,
        )
        return ExecutionResult(request_id=decision.request_id, tool_name=tool_name, status=status,
                               decision=decision, output=result.output, error=result.error)


@dataclass
class BaselineSystem:
    rbac: StaticRBAC
    tools: ToolRegistry
    delegation_ids: dict[str, str]
    delegatees: dict[str, str] = field(default_factory=dict)
    name: str = "baseline_rbac"

    @classmethod
    def build(cls) -> "BaselineSystem":
        global _BASELINE_TEMPLATE
        if _BASELINE_TEMPLATE is None:
            # Derive roles from the identical seed world, then discard it.
            source = TrustGraphSystem.build()
            _BASELINE_TEMPLATE = (StaticRBAC.from_trustgraph(source.tg), source.delegation_ids)
            source.tg.repository.session.close()
        template, delegation_ids = _BASELINE_TEMPLATE
        tools = ToolRegistry(TicketAuthority(new_id("baseline")))
        rbac = StaticRBAC(
            tools=tools,
            role_permissions=copy.deepcopy(template.role_permissions),
            active=dict(template.active),
            capabilities=copy.deepcopy(template.capabilities),
        )
        return cls(rbac=rbac, tools=tools, delegation_ids=dict(delegation_ids))

    def act(self, agent, tool, arguments, purpose=None, untrusted=False, approval_id=None,
            authenticated=None) -> StepResult:
        started = perf_counter()
        result = BaselineEnforcer(self.rbac).execute(agent, tool, arguments, None, None, authenticated)
        return _from_execution(result, (perf_counter() - started) * 1000)

    def delegate(self, delegator, delegatee, grants, depth=0) -> StepResult:
        started = perf_counter()
        _, reason, delegation_id = self.rbac.delegate(delegator, delegatee, grants)
        self.delegatees[delegation_id] = delegatee
        elapsed = (perf_counter() - started) * 1000
        return StepResult("executed", "allow", reason, elapsed, elapsed, created_id=delegation_id)

    def revoke(self, key: str, delegatee: str) -> None:
        self.rbac.revoke(delegatee, self.delegation_ids.get(key, key))

    def expire(self, key: str) -> None:
        """Static RBAC has no notion of expiring authority."""

    def suspend(self, agent: str) -> None:
        self.rbac.set_active(agent, False)

    def grant(self, principal, permission, depth=0) -> None:
        self.rbac.grant(principal, permission)

    def add_policy(self, policy) -> None:
        """No policy layer."""

    def approve(self, approval_id) -> None:
        """No approval workflow."""

    def bypass(self, tool, arguments) -> StepResult:
        started = perf_counter()
        request_id = new_id("bypass")
        ticket = self.tools.tickets.issue(request_id, tool, "direct")
        # Without an enforcement point the tool is just a function the agent can call.
        self.tools.protected(tool).invoke(ticket, request_id, "direct", arguments, {})
        elapsed = (perf_counter() - started) * 1000
        return StepResult("executed", "n/a", "Tool invoked directly; nothing intercepts it.", elapsed, elapsed)

    def agent_run(self, agent, task, purpose) -> list[StepResult]:
        runtime = AgentRuntime(BaselineEnforcer(self.rbac), agent, NaiveInstructionFollowingPlanner(),
                               self.tools.specs())
        run = runtime.run(task, purpose=purpose, max_steps=8)
        return [
            StepResult("executed" if step.status in ("executed", "failed") else "blocked",
                       step.decision, step.reason, 0.0, 0.0, raw=step)
            for step in run.steps
        ]
