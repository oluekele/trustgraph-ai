from trustgraph.audit.logger import compute_hash
from trustgraph.audit.models import AuditEvent, AuditEventType


def event(**overrides):
    values = dict(id="evt-1", sequence=1, event_type=AuditEventType.AUTHORIZATION, actor_id="agent-a",
                  decision="allow", reason="ok")
    values.update(overrides)
    return AuditEvent(**values)


def test_hash_covers_every_field_except_itself():
    original = event()
    original.hash = compute_hash(original)
    assert compute_hash(original) == original.hash
    assert compute_hash(event(decision="deny")) != original.hash
    assert compute_hash(event(prev_hash="abc")) != original.hash


def test_hash_payload_excludes_hash():
    assert "hash" not in event(hash="x").hash_payload()
