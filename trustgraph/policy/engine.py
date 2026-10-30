"""Policy evaluation.

Precedence (most restrictive wins):

1. Any matching, enabled DENY policy denies the request.
2. Otherwise any *applicable* REQUIRE_APPROVAL policy requires approval.
3. Otherwise any applicable ALLOW policy allows the request.
4. Otherwise the request is denied (default deny / zero trust).

A policy is *applicable* when it matches the request and all of its
conditions hold. Conditions that reference risk are evaluated with the
runtime risk score, so policy evaluation runs after risk assessment.
"""

from datetime import datetime
from fnmatch import fnmatchcase

from trustgraph.authorization.models import AuthorizationRequest
from trustgraph.delegation.provenance import AuthorityPath
from trustgraph.policy.models import Policy, PolicyEffect, PolicyEvaluation
from trustgraph.risk.models import RiskAssessment


def _matches(values: list[str], candidate: str, wildcard: bool = False) -> bool:
    if not values or "*" in values:
        return True
    if wildcard:
        return any(fnmatchcase(candidate, pattern) for pattern in values)
    return candidate in values


class PolicyEngine:
    def __init__(self, policies: list[Policy]):
        self.policies = [policy for policy in policies if policy.enabled]

    def matching(self, request: AuthorizationRequest) -> list[Policy]:
        return [
            policy
            for policy in self.policies
            if _matches(policy.subjects, request.agent_id)
            and _matches(policy.capabilities, request.capability)
            and _matches(policy.resources, request.resource, wildcard=True)
            and _matches(policy.actions, request.action)
        ]

    def failed_conditions(
        self,
        policy: Policy,
        request: AuthorizationRequest,
        path: AuthorityPath | None,
        risk: RiskAssessment | None,
        now: datetime,
    ) -> list[str]:
        conditions = policy.conditions
        failed: list[str] = []
        if conditions.require_purpose and not (request.context.purpose or "").strip():
            failed.append(f"{policy.id}: a stated purpose is required")
        if conditions.max_risk_score is not None and risk is not None:
            if risk.score > conditions.max_risk_score:
                failed.append(
                    f"{policy.id}: risk {risk.score:.1f} exceeds limit {conditions.max_risk_score:.1f}"
                )
        if path is not None:
            if conditions.direct_authority_only and not path.is_direct:
                failed.append(f"{policy.id}: only direct (non-delegated) authority is accepted")
            if conditions.max_delegation_hops is not None and path.hops > conditions.max_delegation_hops:
                failed.append(
                    f"{policy.id}: delegation chain of {path.hops} hops exceeds limit "
                    f"{conditions.max_delegation_hops}"
                )
        if conditions.allowed_hours_utc is not None:
            start, end = conditions.allowed_hours_utc
            hour = now.hour
            inside = start <= hour < end if start <= end else (hour >= start or hour < end)
            if not inside:
                failed.append(f"{policy.id}: outside permitted hours {start:02d}-{end:02d} UTC")
        return failed

    def evaluate(
        self,
        request: AuthorizationRequest,
        path: AuthorityPath | None,
        risk: RiskAssessment | None,
        now: datetime,
    ) -> PolicyEvaluation:
        matched = self.matching(request)
        matched_ids = [policy.id for policy in matched]

        denies = [policy for policy in matched if policy.effect == PolicyEffect.DENY]
        if denies:
            policy = min(denies, key=lambda candidate: candidate.priority)
            return PolicyEvaluation(
                effect=PolicyEffect.DENY,
                reason=f"Explicitly denied by policy '{policy.name}'.",
                matched=matched_ids,
                applied=[policy.id for policy in denies],
            )

        applicable: list[Policy] = []
        failed: list[str] = []
        for policy in matched:
            problems = self.failed_conditions(policy, request, path, risk, now)
            if problems:
                failed.extend(problems)
            else:
                applicable.append(policy)

        approvals = [p for p in applicable if p.effect == PolicyEffect.REQUIRE_APPROVAL]
        if approvals:
            policy = min(approvals, key=lambda candidate: candidate.priority)
            return PolicyEvaluation(
                effect=PolicyEffect.REQUIRE_APPROVAL,
                reason=f"Policy '{policy.name}' requires human approval.",
                matched=matched_ids,
                applied=[policy.id for policy in approvals],
                failed_conditions=failed,
            )

        allows = [p for p in applicable if p.effect == PolicyEffect.ALLOW]
        if allows:
            policy = min(allows, key=lambda candidate: candidate.priority)
            return PolicyEvaluation(
                effect=PolicyEffect.ALLOW,
                reason=f"Permitted by policy '{policy.name}'.",
                matched=matched_ids,
                applied=[policy.id for policy in allows],
                failed_conditions=failed,
            )

        if failed:
            reason = "No policy permits the request: " + "; ".join(failed) + "."
        else:
            reason = "No policy permits the request (default deny)."
        return PolicyEvaluation(
            effect=None,
            reason=reason,
            matched=matched_ids,
            failed_conditions=failed,
        )
