"""Revocation cascades to every delegation that depended on the revoked link."""

import pytest

from tests.conftest import delegate
from trustgraph.audit.models import AuditEventType
from trustgraph.delegation.models import DelegationStatus
from trustgraph.errors import NotFoundError, ValidationError
from trustgraph.seed import CRM_READ


def status(tg, delegation_id):
    return tg.repository.get_delegation(delegation_id).status


def test_root_revocation_cascades_through_the_chain(tg, world):
    ids = world.delegation_ids
    revoked = tg.delegations.revoke_delegation(ids["bayo->orchestrator"], revoked_by="u-bayo")
    revoked_ids = {delegation.id for delegation in revoked}
    assert {ids["bayo->orchestrator"], ids["orchestrator->finance"], ids["finance->reporting"],
            ids["orchestrator->reporting"]} <= revoked_ids
    assert status(tg, ids["finance->reporting"]) == DelegationStatus.REVOKED
    # Independent chains are untouched.
    assert status(tg, ids["efe->support"]) == DelegationStatus.ACTIVE


def test_partially_backed_delegations_survive(tg, world):
    # agent-intern receives CRM read from two independent sources.
    from_support_chain = delegate(tg, "u-efe", "agent-intern", CRM_READ)
    from_bayo_chain = delegate(tg, "agent-orchestrator", "agent-intern", CRM_READ, depth=1)
    assert from_support_chain.accepted and from_bayo_chain.accepted
    onward = delegate(tg, "agent-intern", "agent-reporting", CRM_READ)
    assert onward.accepted
    tg.delegations.revoke_delegation(world.delegation_ids["bayo->orchestrator"])
    # The onward delegation was backed by the bayo chain only (efe's grant to intern has depth 0).
    assert status(tg, onward.delegation.id) == DelegationStatus.REVOKED
    assert status(tg, from_support_chain.delegation.id) == DelegationStatus.ACTIVE


def test_revocations_are_audited(tg, world):
    tg.delegations.revoke_delegation(world.delegation_ids["orchestrator->finance"], revoked_by="u-bayo")
    events = tg.repository.list_audit_events(event_type=AuditEventType.DELEGATION_REVOKED.value)
    assert len(events) == 2  # the target and finance->reporting
    assert any("Cascade" in event.reason for event in events)


def test_revoking_twice_is_rejected(tg, world):
    tg.delegations.revoke_delegation(world.delegation_ids["dele->devops"])
    with pytest.raises(ValidationError):
        tg.delegations.revoke_delegation(world.delegation_ids["dele->devops"])


def test_revoking_unknown_delegation(tg):
    with pytest.raises(NotFoundError):
        tg.delegations.revoke_delegation("dlg-missing")


def test_grant_revocation_cascades_into_the_register(tg, world):
    grant = next(g for g in tg.direct_authority.list("u-chioma") if g.capability == "web.search")
    _, cascaded = tg.revoke_grant(grant.id, "admin")
    assert world.delegation_ids["chioma->research"] not in {d.id for d in cascaded}  # still backs other grants
    assert status(tg, world.delegation_ids["chioma->research"]) == DelegationStatus.ACTIVE
    assert not tg.reconstructor.reconstruct("agent-research").has_exact_grant("web.search", "web://internet", "search")
