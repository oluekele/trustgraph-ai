"""Delegation validation rules (identity, capability, expiry, duplicates)."""

from datetime import timedelta

from tests.conftest import delegate
from trustgraph.audit.models import AuditEventType
from trustgraph.identity.models import PrincipalStatus
from trustgraph.seed import CALC, CRM_READ, NOTES_FILE_READ, WEEKLY_WRITE


def test_valid_delegation_is_created_and_audited(tg):
    result = delegate(tg, "agent-orchestrator", "agent-intern", CRM_READ)
    assert result.accepted
    assert result.delegation.depth == 2
    events = tg.repository.list_audit_events(event_type=AuditEventType.DELEGATION_CREATED.value, limit=1)
    assert events[0].details["delegation_id"] == result.delegation.id


def test_self_delegation_is_rejected(tg):
    result = delegate(tg, "agent-orchestrator", "agent-orchestrator", CALC)
    assert not result.accepted
    assert "itself" in result.reason


def test_delegation_to_a_human_is_rejected(tg):
    result = delegate(tg, "agent-orchestrator", "u-efe", CALC)
    assert not result.accepted
    assert "only be delegated to AI agents" in result.reason


def test_suspended_delegator_cannot_delegate(tg):
    tg.identity.set_status("agent-orchestrator", PrincipalStatus.SUSPENDED)
    result = delegate(tg, "agent-orchestrator", "agent-intern", CRM_READ)
    assert not result.accepted
    assert "suspended" in result.reason


def test_suspended_delegatee_cannot_receive(tg):
    result = delegate(tg, "u-chioma", "agent-legacy", NOTES_FILE_READ)
    assert not result.accepted
    assert "suspended" in result.reason


def test_delegatee_must_have_the_technical_capability(tg):
    result = delegate(tg, "agent-orchestrator", "agent-support", WEEKLY_WRITE)
    assert not result.accepted
    assert "lacks the technical capability" in result.reason


def test_past_expiry_is_rejected(tg):
    result = delegate(tg, "agent-orchestrator", "agent-intern", CRM_READ, expires_in=timedelta(seconds=-5))
    assert not result.accepted
    assert "future" in result.reason


def test_duplicate_grants_are_rejected(tg):
    result = delegate(tg, "agent-orchestrator", "agent-intern", CRM_READ, CRM_READ)
    assert not result.accepted
    assert "duplicate" in result.reason


def test_rejections_are_audited_with_all_violations(tg):
    result = delegate(tg, "agent-intern", "agent-reporting", CRM_READ)
    assert not result.accepted
    event = tg.repository.list_audit_events(event_type=AuditEventType.DELEGATION_REJECTED.value, limit=1)[0]
    assert event.decision == "deny"
    assert event.details["violations"] == result.violations
