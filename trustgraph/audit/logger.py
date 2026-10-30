from typing import Any

from trustgraph.audit.models import AuditEvent, AuditEventType, AuditVerification
from trustgraph.common import canonical_json, new_id, sha256_hex, utc_now
from trustgraph.persistence.repository import Repository


def compute_hash(event: AuditEvent) -> str:
    return sha256_hex(event.prev_hash + canonical_json(event.hash_payload()))


class AuditLogger:
    """Append-only, hash-chained governance log persisted in the database."""

    def __init__(self, repository: Repository):
        self.repository = repository

    def record(self, event_type: AuditEventType, actor_id: str, **fields: Any) -> AuditEvent:
        head = self.repository.lock_chain_head()
        event = AuditEvent(
            id=new_id("evt"),
            sequence=head.sequence + 1,
            timestamp=utc_now(),
            event_type=event_type,
            actor_id=actor_id,
            prev_hash=head.hash,
            **fields,
        )
        event.hash = compute_hash(event)
        self.repository.add_audit_event(event)
        head.sequence = event.sequence
        head.hash = event.hash
        self.repository.session.flush()
        return event

    def get_all(self, limit: int = 1000) -> list[AuditEvent]:
        return self.repository.list_audit_events(limit=limit, ascending=True)

    def get_by_agent(self, agent_id: str, limit: int = 1000) -> list[AuditEvent]:
        return self.repository.list_audit_events(actor_id=agent_id, limit=limit, ascending=True)

    def verify(self) -> AuditVerification:
        """Recompute every hash and check sequence continuity."""
        previous_hash = ""
        expected_sequence = 1
        checked = 0
        for event in self.repository.iter_audit_chain():
            checked += 1
            if event.sequence != expected_sequence:
                return AuditVerification(
                    valid=False,
                    events_checked=checked,
                    first_invalid_sequence=event.sequence,
                    detail=f"Sequence gap: expected {expected_sequence}, found {event.sequence}.",
                )
            if event.prev_hash != previous_hash:
                return AuditVerification(
                    valid=False,
                    events_checked=checked,
                    first_invalid_sequence=event.sequence,
                    detail="Event does not link to its predecessor (prev_hash mismatch).",
                )
            if compute_hash(event) != event.hash:
                return AuditVerification(
                    valid=False,
                    events_checked=checked,
                    first_invalid_sequence=event.sequence,
                    detail="Event content does not match its recorded hash.",
                )
            previous_hash = event.hash
            expected_sequence += 1
        return AuditVerification(
            valid=True,
            events_checked=checked,
            detail=f"All {checked} audit events verified.",
        )
