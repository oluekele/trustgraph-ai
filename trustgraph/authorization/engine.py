"""Runtime authorisation pipeline (proposal §8.10).

    1. identify the requesting agent (and match its credential)
    2. validate the technical capability
    3. validate the resource and action
    4. reconstruct effective authority and check the exact grant
    5. assess runtime risk
    6. evaluate policy (explicit deny > approval > allow > default deny)
    7. combine policy and risk into ALLOW / RESTRICT / REQUIRE_APPROVAL / DENY
    8. apply a matching human approval, if one was presented
    9. record the decision in the audit log

Every step appends to a trace so each decision is explainable. Any
failure to establish a fact results in DENY (fail closed).
"""

from time import perf_counter

from trustgraph.approval.service import ApprovalService
from trustgraph.audit.logger import AuditLogger
from trustgraph.audit.models import AuditEventType
from trustgraph.authorization.models import (
    AuthorizationDecision,
    AuthorizationRequest,
    Decision,
    TraceStep,
)
from trustgraph.capability.catalog import canonical_resource
from trustgraph.common import utc_now
from trustgraph.delegation.provenance import AuthorityPath
from trustgraph.delegation.reconstructor import EffectiveAuthorityReconstructor
from trustgraph.errors import ValidationError
from trustgraph.persistence.repository import Repository
from trustgraph.policy.engine import PolicyEngine
from trustgraph.policy.models import PolicyEffect
from trustgraph.risk.action_sensitivity import ActionSensitivityAnalyzer
from trustgraph.risk.engine import RiskEngine
from trustgraph.risk.factors import RuntimeRiskFactorsBuilder
from trustgraph.risk.models import RiskAssessment, RiskLevel

RISK_DECISION = {
    RiskLevel.LOW: Decision.ALLOW,
    RiskLevel.MEDIUM: Decision.RESTRICT,
    RiskLevel.HIGH: Decision.REQUIRE_APPROVAL,
    RiskLevel.CRITICAL: Decision.DENY,
}

READ_RESTRICTIONS = {"mode": "restricted", "max_records": 5, "redact_pii": True}
WRITE_RESTRICTIONS = {"mode": "restricted", "max_affected_records": 1, "redact_pii": True}


class AuthorizationEngine:
    def __init__(
        self,
        repository: Repository,
        reconstructor: EffectiveAuthorityReconstructor,
        risk_engine: RiskEngine,
        approvals: ApprovalService,
        audit: AuditLogger,
    ):
        self.repository = repository
        self.reconstructor = reconstructor
        self.risk_engine = risk_engine
        self.approvals = approvals
        self.audit = audit
        self.factors = RuntimeRiskFactorsBuilder(
            repository, risk_engine.config.behaviour_window_minutes
        )
        self.actions = ActionSensitivityAnalyzer()

    def evaluate(self, request: AuthorizationRequest) -> AuthorizationDecision:
        started = perf_counter()
        decision = self._evaluate(request)
        decision.latency_ms = round((perf_counter() - started) * 1000, 3)
        self._audit(request, decision)
        return decision

    # ------------------------------------------------------------------

    def _evaluate(self, request: AuthorizationRequest) -> AuthorizationDecision:
        now = utc_now()
        trace: list[TraceStep] = []

        def outcome(
            decision: Decision,
            reason: str,
            path: AuthorityPath | None = None,
            risk: RiskAssessment | None = None,
            policies: list[str] | None = None,
            **extra,
        ) -> AuthorizationDecision:
            return AuthorizationDecision(
                request_id=request.request_id,
                decision=decision,
                reason=reason,
                agent_id=request.agent_id,
                capability=request.capability,
                resource=request.resource,
                action=request.action,
                on_behalf_of=path.root_principal_id if path else None,
                authority_path=path,
                matched_policies=policies or [],
                risk=risk,
                trace=trace,
                fingerprint=request.fingerprint(),
                **extra,
            )

        def deny(step: str, reason: str, **kwargs) -> AuthorizationDecision:
            trace.append(TraceStep(step=step, outcome="fail", detail=reason))
            return outcome(Decision.DENY, reason, **kwargs)

        # 0. Canonical resource identifier ---------------------------------
        try:
            canonical = canonical_resource(request.resource)
        except ValidationError as exc:
            return deny("resource", str(exc))
        if canonical != request.resource:
            trace.append(
                TraceStep(
                    step="resource",
                    outcome="info",
                    detail=f"Resource canonicalised: '{request.resource}' → '{canonical}'.",
                )
            )
            request.resource = canonical

        # 1. Identity -----------------------------------------------------
        if (
            request.authenticated_principal_id is not None
            and request.authenticated_principal_id != request.agent_id
        ):
            return deny(
                "identity",
                f"Credential belongs to '{request.authenticated_principal_id}', not "
                f"'{request.agent_id}' (identity misuse).",
            )
        agent = self.repository.get_principal(request.agent_id)
        if agent is None:
            return deny("identity", f"Unknown agent '{request.agent_id}'.")
        if not agent.is_agent:
            return deny("identity", "Only registered AI agents can request tool actions.")
        if not agent.is_active:
            return deny("identity", f"Agent '{agent.id}' is {agent.status.value}.")
        trace.append(TraceStep(step="identity", outcome="pass", detail=f"Agent '{agent.id}' is active."))

        # 2. Technical capability -------------------------------------------
        capability = self.repository.get_capability(request.capability)
        if capability is None:
            return deny("capability", f"Unknown capability '{request.capability}'.")
        if not agent.has_capability(request.capability):
            return deny(
                "capability",
                f"Agent lacks the technical capability '{request.capability}'.",
            )
        trace.append(
            TraceStep(step="capability", outcome="pass", detail=f"Agent has '{request.capability}'.")
        )

        # 3. Resource and action ------------------------------------------
        resource = self.repository.get_resource(request.resource)
        if resource is None:
            return deny("resource", f"'{request.resource}' is not a registered protected resource.")
        if request.action not in resource.allowed_actions:
            return deny(
                "action",
                f"Action '{request.action}' is not defined for '{resource.id}'.",
            )
        if capability.actions and request.action not in capability.actions:
            return deny(
                "action",
                f"Capability '{capability.name}' cannot perform '{request.action}'.",
            )
        trace.append(
            TraceStep(
                step="resource",
                outcome="pass",
                detail=f"{resource.id} ({resource.classification.value}) supports '{request.action}'.",
            )
        )

        # 4. Effective authority (exact grant) -------------------------------
        authority = self.reconstructor.reconstruct(agent.id, now)
        path = authority.best_path(request.permission)
        if path is None:
            return deny(
                "authority",
                "Agent holds the capability but no authority grant for "
                f"{request.permission} (capability does not imply authority).",
            )
        chain = " → ".join(path.principals)
        trace.append(
            TraceStep(
                step="authority",
                outcome="pass",
                detail=(
                    f"Exact grant held {'directly' if path.is_direct else f'via {path.hops}-hop delegation'}"
                    f" ({chain})."
                ),
            )
        )

        # 5. Runtime risk ---------------------------------------------------
        factors, notes = self.factors.build(request, resource, path)
        risk = self.risk_engine.assess(factors, notes)
        risk_decision = RISK_DECISION[risk.level]
        trace.append(
            TraceStep(
                step="risk",
                outcome="warn" if risk.level != RiskLevel.LOW else "pass",
                detail=f"Risk {risk.score:.1f} ({risk.level.value})"
                + (f": {', '.join(notes)}" if notes else "."),
            )
        )

        # 6. Policy ----------------------------------------------------------
        policies = PolicyEngine(self.repository.list_policies(enabled_only=True))
        evaluation = policies.evaluate(request, path, risk, now)
        if evaluation.effect in (None, PolicyEffect.DENY):
            return deny(
                "policy",
                evaluation.reason,
                path=path,
                risk=risk,
                policies=evaluation.applied or evaluation.matched,
            )
        trace.append(TraceStep(step="policy", outcome="pass", detail=evaluation.reason))
        policy_decision = (
            Decision.REQUIRE_APPROVAL
            if evaluation.effect == PolicyEffect.REQUIRE_APPROVAL
            else Decision.ALLOW
        )

        # 7. Combine ---------------------------------------------------------
        final = Decision.most_restrictive(policy_decision, risk_decision)
        if final == Decision.DENY:
            return deny(
                "decision",
                f"Critical runtime risk ({risk.score:.1f}) blocks execution.",
                path=path,
                risk=risk,
                policies=evaluation.applied,
            )
        reasons = {
            Decision.ALLOW: "Within authority, permitted by policy, acceptable risk.",
            Decision.RESTRICT: f"Permitted with restrictions at {risk.level.value} risk ({risk.score:.1f}).",
            Decision.REQUIRE_APPROVAL: (
                evaluation.reason
                if policy_decision == Decision.REQUIRE_APPROVAL
                else f"High runtime risk ({risk.score:.1f}) requires human approval."
            ),
        }
        reason = reasons[final]

        # 8. Human approval -------------------------------------------------
        approval_id = None
        approved_by = None
        if final == Decision.REQUIRE_APPROVAL:
            fingerprint = request.fingerprint()
            if request.approval_id:
                check = self.approvals.check(request.approval_id, fingerprint, now)
                if check.outcome == "approved":
                    self.approvals.consume(check.approval)
                    trace.append(TraceStep(step="approval", outcome="pass", detail=check.detail))
                    final = Decision.ALLOW
                    approval_id = request.approval_id
                    approved_by = check.approval.decided_by
                    reason = f"Approved by human reviewer {approved_by}; authority re-validated."
                elif check.outcome == "rejected":
                    return deny(
                        "approval",
                        f"Human reviewer rejected this action. {check.detail}",
                        path=path,
                        risk=risk,
                        policies=evaluation.applied,
                    )
                else:
                    trace.append(TraceStep(step="approval", outcome="fail", detail=check.detail))
            if final == Decision.REQUIRE_APPROVAL:
                approval = self.approvals.request(request, fingerprint, risk, reason)
                approval_id = approval.id
                trace.append(
                    TraceStep(
                        step="approval",
                        outcome="warn",
                        detail=f"Awaiting human approval ({approval.id}).",
                    )
                )

        restrictions: dict = {}
        if final == Decision.RESTRICT:
            restrictions = dict(
                WRITE_RESTRICTIONS
                if self.actions.is_side_effecting(request.action)
                else READ_RESTRICTIONS
            )
        trace.append(TraceStep(step="decision", outcome="pass" if final.permits_execution else "warn", detail=reason))
        return outcome(
            final,
            reason,
            path=path,
            risk=risk,
            policies=evaluation.applied,
            restrictions=restrictions,
            approval_id=approval_id,
            approved_by=approved_by,
        )

    def _audit(self, request: AuthorizationRequest, decision: AuthorizationDecision) -> None:
        path = decision.authority_path
        risk = decision.risk
        self.audit.record(
            AuditEventType.AUTHORIZATION,
            actor_id=request.agent_id,
            on_behalf_of=decision.on_behalf_of,
            delegation_chain=path.chain if path else [],
            principal_chain=path.principals if path else [],
            request_id=request.request_id,
            tool_name=request.tool_name,
            capability=request.capability,
            resource=request.resource,
            action=request.action,
            purpose=request.context.purpose,
            decision=decision.decision.value,
            reason=decision.reason,
            policy_ids=decision.matched_policies,
            risk_score=risk.score if risk else None,
            risk_level=risk.level.value if risk else None,
            risk_factors=risk.factors.model_dump() if risk else None,
            details={
                "source": request.context.source,
                "untrusted_input": request.context.untrusted_input,
                "approval_id": decision.approval_id,
                "approved_by": decision.approved_by,
                "restrictions": decision.restrictions,
                "latency_ms": decision.latency_ms,
                "trace": [step.model_dump() for step in decision.trace],
            },
        )
