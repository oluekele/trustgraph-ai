"""Tamper-evident hash chain."""

from sqlalchemy import update

from tests.conftest import execute
from trustgraph.persistence.tables import AuditEventRow


def test_chain_verifies_after_activity(tg):
    execute(tg, "agent-research", "calculator", {"expression": "1+1"})
    execute(tg, "agent-intern", "crm_query", {})
    verification = tg.audit.verify()
    assert verification.valid
    assert verification.events_checked == tg.repository.count_audit_events()


def test_sequence_numbers_are_contiguous(tg):
    events = list(tg.repository.iter_audit_chain())
    assert [e.sequence for e in events] == list(range(1, len(events) + 1))
    assert all(events[i].prev_hash == events[i - 1].hash for i in range(1, len(events)))


def test_modified_event_is_detected(tg):
    execute(tg, "agent-intern", "crm_query", {})
    target = tg.repository.list_audit_events(decision="deny", limit=1)[0]
    tg.repository.session.execute(
        update(AuditEventRow).where(AuditEventRow.id == target.id).values(decision="allow")
    )
    result = tg.audit.verify()
    assert not result.valid
    assert result.first_invalid_sequence == target.sequence


def test_deleted_event_is_detected(tg):
    middle = tg.repository.list_audit_events(limit=1, offset=5)[0]
    tg.repository.session.query(AuditEventRow).filter(AuditEventRow.id == middle.id).delete()
    result = tg.audit.verify()
    assert not result.valid
    assert "Sequence gap" in result.detail
