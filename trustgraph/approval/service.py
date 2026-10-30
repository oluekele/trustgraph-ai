"""Human-in-the-loop approval for high-risk actions.

An approval is bound to the SHA-256 fingerprint of one exact action
(agent, capability, resource, action, arguments, purpose), expires, and is
consumed on first use. Approving never bypasses authorisation: the full
pipeline is re-run when the agent retries, and an approval only lifts a
REQUIRE_APPROVAL outcome — it cannot override DENY.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from trustgraph.approval.models import ApprovalRequest, ApprovalStatus
from trustgraph.audit.logger import AuditLogger
from trustgraph.audit.models import AuditEventType
from trustgraph.authorization.models import AuthorizationRequest
from trustgraph.common import new_id, utc_now
from trustgraph.errors import NotFoundError, ValidationError
from trustgraph.persistence.repository import Repository
from trustgraph.risk.models import RiskAssessment


@dataclass
class ApprovalCheck:
    outcome: str  # approved | rejected | unusable
    detail: str
    approval: ApprovalRequest | None = None


class ApprovalService:
    def __init__(self, repository: Repository, audit: AuditLogger, ttl_minutes: int = 30):
        self.repository = repository
        self.audit = audit
        self.ttl = timedelta(minutes=ttl_minutes)

    def request(
        self,
        request: AuthorizationRequest,
        fingerprint: str,
        risk: RiskAssessment | None,
        reason: str,
    ) -> ApprovalRequest:
        existing = self.repository.pending_approval_for(fingerprint)
        if existing is not None and existing.effective_status(utc_now()) == ApprovalStatus.PENDING:
            return existing
        now = utc_now()
        approval = ApprovalRequest(
            id=new_id("apr"),
            fingerprint=fingerprint,
            agent_id=request.agent_id,
            capability=request.capability,
            resource=request.resource,
            action=request.action,
            arguments=request.arguments,
            purpose=request.context.purpose,
            tool_name=request.tool_name,
            risk_score=risk.score if risk else None,
            risk_level=risk.level.value if risk else None,
            reason=reason,
            requested_at=now,
            expires_at=now + self.ttl,
        )
        self.repository.add_approval(approval)
        self.audit.record(
            AuditEventType.APPROVAL_REQUESTED,
            actor_id=request.agent_id,
            request_id=request.request_id,
            capability=request.capability,
            resource=request.resource,
            action=request.action,
            decision="require_approval",
            reason=reason,
            details={"approval_id": approval.id},
        )
        return approval

    def decide(
        self, approval_id: str, approve: bool, decided_by: str, note: str | None = None
    ) -> ApprovalRequest:
        approval = self.get(approval_id)
        now = utc_now()
        status = approval.effective_status(now)
        if status != ApprovalStatus.PENDING:
            raise ValidationError(f"Approval '{approval_id}' is {status.value} and cannot be decided.")
        if not decided_by:
            raise ValidationError("An approval decision must identify the human approver.")
        if decided_by == approval.agent_id:
            raise ValidationError("The requesting agent cannot approve its own action.")
        approver = self.repository.get_principal(decided_by)
        if approver is not None and approver.is_agent:
            raise ValidationError("AI agents cannot approve actions; a human approver is required.")

        updated = approval.model_copy(
            update={
                "status": ApprovalStatus.APPROVED if approve else ApprovalStatus.REJECTED,
                "decided_by": decided_by,
                "decided_at": now,
                "decision_note": note,
            }
        )
        self.repository.update_approval(updated)
        self.audit.record(
            AuditEventType.APPROVAL_DECIDED,
            actor_id=decided_by,
            capability=approval.capability,
            resource=approval.resource,
            action=approval.action,
            decision="approved" if approve else "rejected",
            reason=note or "",
            details={"approval_id": approval_id, "agent_id": approval.agent_id},
        )
        return updated

    def check(self, approval_id: str, fingerprint: str, now: datetime) -> ApprovalCheck:
        approval = self.repository.get_approval(approval_id)
        if approval is None:
            return ApprovalCheck("unusable", f"Approval '{approval_id}' does not exist.")
        if approval.fingerprint != fingerprint:
            return ApprovalCheck(
                "unusable",
                "Approval was granted for a different action (fingerprint mismatch).",
                approval,
            )
        status = approval.effective_status(now)
        if status == ApprovalStatus.REJECTED:
            return ApprovalCheck("rejected", f"Rejected by {approval.decided_by}.", approval)
        if status != ApprovalStatus.APPROVED:
            return ApprovalCheck("unusable", f"Approval is {status.value}.", approval)
        return ApprovalCheck("approved", f"Approved by {approval.decided_by}.", approval)

    def consume(self, approval: ApprovalRequest) -> None:
        self.repository.update_approval(
            approval.model_copy(update={"status": ApprovalStatus.CONSUMED, "consumed_at": utc_now()})
        )

    def get(self, approval_id: str) -> ApprovalRequest:
        approval = self.repository.get_approval(approval_id)
        if approval is None:
            raise NotFoundError(f"Approval '{approval_id}' not found.")
        return approval

    def list(self, status: ApprovalStatus | None = None) -> list[ApprovalRequest]:
        now = utc_now()
        approvals = self.repository.list_approvals()
        if status is None:
            return approvals
        return [approval for approval in approvals if approval.effective_status(now) == status]
