"""Allowed, restricted, escalated and denied actions are all audited."""

import pytest

from tests.conftest import execute

CASES = [
    ("agent-research", "calculator", {"expression": "1+1"}, "allow", "executed"),
    ("agent-reporting", "crm_query", {"table": "customers"}, "restrict", "restricted"),
    ("agent-support", "crm_delete", {"record_ids": ["C-1004"]}, "require_approval", "pending_approval"),
    ("agent-intern", "crm_query", {"table": "customers"}, "deny", "blocked"),
]


@pytest.mark.parametrize(("agent", "tool", "arguments", "decision", "status"), CASES)
def test_each_outcome_produces_authorization_and_execution_events(tg, agent, tool, arguments, decision, status):
    result = execute(tg, agent, tool, arguments, purpose="Audit test")
    events = tg.repository.list_audit_events(request_id=result.request_id, ascending=True)
    core = [event for event in events if event.event_type in ("authorization", "execution")]
    assert [event.event_type for event in core] == ["authorization", "execution"]
    if decision == "require_approval":
        assert any(event.event_type == "approval.requested" for event in events)
    authorization, execution = core
    assert authorization.decision == decision
    assert execution.execution_status == status
    for field in ("actor_id", "capability", "resource", "action", "reason", "timestamp"):
        assert getattr(authorization, field)
    assert authorization.purpose == "Audit test"
    assert authorization.details["trace"]
