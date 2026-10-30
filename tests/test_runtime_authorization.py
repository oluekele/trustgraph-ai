"""Human approval: bound to the exact action, single-use, re-validated."""

import pytest

from tests.conftest import execute
from trustgraph.errors import ValidationError

PAY = {"account": "vendor-payouts", "recipient": "NW", "amount": 120.0}


def request_approval(tg):
    result = execute(tg, "agent-finance", "payment_transfer", PAY, purpose="Invoice 42")
    assert result.status == "pending_approval"
    return result.decision.approval_id


def retry(tg, approval_id, arguments=PAY, purpose="Invoice 42"):
    from trustgraph.authorization.models import RequestContext

    result = tg.enforcer.execute("agent-finance", "payment_transfer", arguments,
                                 RequestContext(purpose=purpose), approval_id=approval_id)
    tg.commit()
    return result


def test_requesting_approval_alone_never_executes(tg):
    request_approval(tg)
    assert tg.tools.sandbox.ledger == []


def test_repeated_requests_reuse_the_pending_approval(tg):
    assert request_approval(tg) == request_approval(tg)


def test_approved_action_executes_once(tg):
    approval_id = request_approval(tg)
    tg.approvals.decide(approval_id, True, "u-bayo")
    assert retry(tg, approval_id).status == "executed"
    assert len(tg.tools.sandbox.ledger) == 1
    replay = retry(tg, approval_id)
    assert replay.status == "pending_approval"
    assert replay.decision.approval_id != approval_id
    assert len(tg.tools.sandbox.ledger) == 1


def test_approval_cannot_be_used_for_different_arguments(tg):
    approval_id = request_approval(tg)
    tg.approvals.decide(approval_id, True, "u-bayo")
    result = retry(tg, approval_id, arguments={**PAY, "amount": 99999.0})
    assert result.status == "pending_approval"
    assert any("fingerprint mismatch" in step.detail for step in result.decision.trace)


def test_rejected_approval_denies(tg):
    approval_id = request_approval(tg)
    tg.approvals.decide(approval_id, False, "u-bayo", "Not on the vendor list")
    result = retry(tg, approval_id)
    assert result.status == "blocked"
    assert "rejected" in result.decision.reason


def test_approval_does_not_survive_lost_authority(tg, world):
    approval_id = request_approval(tg)
    tg.approvals.decide(approval_id, True, "u-bayo")
    tg.delegations.revoke_delegation(world.delegation_ids["orchestrator->finance"])
    result = retry(tg, approval_id)
    assert result.status == "blocked"
    assert tg.tools.sandbox.ledger == []


def test_agents_cannot_approve(tg):
    approval_id = request_approval(tg)
    with pytest.raises(ValidationError, match="human approver"):
        tg.approvals.decide(approval_id, True, "agent-orchestrator")
    with pytest.raises(ValidationError, match="own action"):
        tg.approvals.decide(approval_id, True, "agent-finance")
