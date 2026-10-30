"""Audit events carry the full risk assessment."""

from tests.conftest import execute


def test_risk_score_level_and_factors_are_recorded(tg):
    result = execute(tg, "agent-support", "crm_delete", {"record_ids": ["C-1004"]}, purpose="Erasure")
    event = tg.repository.list_audit_events(request_id=result.request_id, event_type="authorization")[0]
    assert event.risk_score == result.decision.risk.score
    assert event.risk_level == "high"
    assert set(event.risk_factors) == {
        "action_sensitivity", "resource_sensitivity", "delegation_risk", "context_risk", "behavioural_risk",
    }
    assert event.details["approval_id"] == result.decision.approval_id


def test_decisions_before_risk_assessment_have_no_score(tg):
    result = execute(tg, "agent-intern", "crm_query", {})
    event = tg.repository.list_audit_events(request_id=result.request_id, event_type="authorization")[0]
    assert event.decision == "deny" and event.risk_score is None
