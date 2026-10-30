"""Runtime enforcement: every protected tool call passes through governance.

    agent → RuntimeEnforcer.execute → AuthorizationEngine → decision
          → (only if ALLOW/RESTRICT) signed single-use ticket → ProtectedTool

The enforcer is the only holder of tool tickets. It fails closed: if the
governance evaluation raises for any reason, the action is denied.
"""

import logging
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel

from trustgraph.audit.logger import AuditLogger
from trustgraph.audit.models import AuditEventType
from trustgraph.authorization.engine import AuthorizationEngine
from trustgraph.authorization.models import (
    AuthorizationDecision,
    AuthorizationRequest,
    Decision,
    RequestContext,
    TraceStep,
)
from trustgraph.common import new_id

if TYPE_CHECKING:
    from ai_agent.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)


class ExecutionStatus(StrEnum):
    EXECUTED = "executed"
    RESTRICTED = "restricted"
    PENDING_APPROVAL = "pending_approval"
    BLOCKED = "blocked"
    FAILED = "failed"


class ExecutionResult(BaseModel):
    request_id: str
    tool_name: str
    status: ExecutionStatus
    decision: AuthorizationDecision
    output: Any = None
    error: str | None = None

    @property
    def executed(self) -> bool:
        return self.status in (ExecutionStatus.EXECUTED, ExecutionStatus.RESTRICTED)


class RuntimeEnforcer:
    def __init__(self, engine: AuthorizationEngine, registry: "ToolRegistry", audit: AuditLogger):
        self.engine = engine
        self.registry = registry
        self.audit = audit

    def execute(
        self,
        agent_id: str,
        tool_name: str,
        arguments: dict[str, Any],
        context: RequestContext | None = None,
        approval_id: str | None = None,
        authenticated_principal_id: str | None = None,
    ) -> ExecutionResult:
        context = context or RequestContext()
        request_id = new_id("req")
        spec = self.registry.spec(tool_name)

        if spec is None:
            decision = self._synthetic_denial(
                request_id, agent_id, f"Unknown tool '{tool_name}'.", "tool", tool_name
            )
            self._record_execution(decision, tool_name, "blocked", context)
            return ExecutionResult(
                request_id=request_id, tool_name=tool_name, status=ExecutionStatus.BLOCKED, decision=decision
            )

        try:
            resource, action = spec.resolve(arguments)
            request = AuthorizationRequest(
                request_id=request_id,
                agent_id=agent_id,
                capability=spec.capability,
                resource=resource,
                action=action,
                arguments=arguments,
                context=context,
                tool_name=tool_name,
                approval_id=approval_id,
                authenticated_principal_id=authenticated_principal_id,
            )
            decision = self.engine.evaluate(request)
        except Exception as exc:  # fail closed
            logger.exception("Governance evaluation failed; denying %s", tool_name)
            self.engine.repository.rollback()
            decision = self._synthetic_denial(
                request_id,
                agent_id,
                f"Governance evaluation failed ({type(exc).__name__}); action denied (fail-closed).",
                "governance",
                tool_name,
                capability=spec.capability,
            )
            self._record_execution(decision, tool_name, "blocked", context)
            return ExecutionResult(
                request_id=request_id, tool_name=tool_name, status=ExecutionStatus.BLOCKED, decision=decision
            )

        if not decision.decision.permits_execution:
            status = (
                ExecutionStatus.PENDING_APPROVAL
                if decision.decision == Decision.REQUIRE_APPROVAL
                else ExecutionStatus.BLOCKED
            )
            self._record_execution(decision, tool_name, status.value, context)
            return ExecutionResult(request_id=request_id, tool_name=tool_name, status=status, decision=decision)

        ticket = self.registry.tickets.issue(request_id, tool_name, decision.fingerprint)
        try:
            output = self.registry.protected(tool_name).invoke(
                ticket, request_id, decision.fingerprint, arguments, decision.restrictions
            )
        except Exception as exc:
            self._record_execution(decision, tool_name, "failed", context, error=str(exc))
            return ExecutionResult(
                request_id=request_id,
                tool_name=tool_name,
                status=ExecutionStatus.FAILED,
                decision=decision,
                error=str(exc),
            )

        status = (
            ExecutionStatus.RESTRICTED if decision.decision == Decision.RESTRICT else ExecutionStatus.EXECUTED
        )
        self._record_execution(decision, tool_name, status.value, context)
        return ExecutionResult(
            request_id=request_id, tool_name=tool_name, status=status, decision=decision, output=output
        )

    def _synthetic_denial(
        self,
        request_id: str,
        agent_id: str,
        reason: str,
        step: str,
        tool_name: str,
        capability: str = "",
    ) -> AuthorizationDecision:
        return AuthorizationDecision(
            request_id=request_id,
            decision=Decision.DENY,
            reason=reason,
            agent_id=agent_id,
            capability=capability,
            resource="",
            action="",
            trace=[TraceStep(step=step, outcome="fail", detail=reason)],
        )

    def _record_execution(
        self,
        decision: AuthorizationDecision,
        tool_name: str,
        status: str,
        context: RequestContext,
        error: str | None = None,
    ) -> None:
        path = decision.authority_path
        try:
            self.audit.record(
                AuditEventType.EXECUTION,
                actor_id=decision.agent_id,
                on_behalf_of=decision.on_behalf_of,
                delegation_chain=path.chain if path else [],
                principal_chain=path.principals if path else [],
                request_id=decision.request_id,
                tool_name=tool_name,
                capability=decision.capability or None,
                resource=decision.resource or None,
                action=decision.action or None,
                purpose=context.purpose,
                decision=decision.decision.value,
                reason=error or decision.reason,
                policy_ids=decision.matched_policies,
                risk_score=decision.risk.score if decision.risk else None,
                risk_level=decision.risk.level.value if decision.risk else None,
                execution_status=status,
                details={"restrictions": decision.restrictions, "approval_id": decision.approval_id},
            )
        except Exception:
            logger.exception("Failed to record execution audit event")
            self.engine.repository.rollback()
