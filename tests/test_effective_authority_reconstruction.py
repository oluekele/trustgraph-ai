"""Reconstruction is recomputed from current state: no stale authority."""

from tests.conftest import expire
from trustgraph.identity.models import PrincipalStatus
from trustgraph.seed import CRM_READ


def test_suspending_an_intermediate_agent_removes_downstream_authority(tg):
    assert tg.reconstructor.reconstruct("agent-reporting").has(CRM_READ)
    tg.identity.set_status("agent-finance", PrincipalStatus.SUSPENDED)
    assert not tg.reconstructor.reconstruct("agent-reporting").has(CRM_READ)
    tg.identity.set_status("agent-finance", PrincipalStatus.ACTIVE)
    assert tg.reconstructor.reconstruct("agent-reporting").has(CRM_READ)


def test_expiring_an_upstream_delegation_removes_downstream_authority(tg, world):
    expire(tg, world.delegation_ids["bayo->orchestrator"])
    for agent in ("agent-orchestrator", "agent-finance", "agent-reporting"):
        assert not tg.reconstructor.reconstruct(agent).has(CRM_READ)


def test_root_grant_revocation_removes_all_derived_authority(tg):
    grant = next(
        g for g in tg.direct_authority.list("u-bayo") if g.permission == CRM_READ
    )
    tg.direct_authority.revoke(grant.id)
    for agent in ("agent-orchestrator", "agent-finance", "agent-reporting"):
        assert not tg.reconstructor.reconstruct(agent).has(CRM_READ)
    # agent-support's authority comes from a different root and survives.
    assert tg.reconstructor.reconstruct("agent-support").has(CRM_READ)


def test_unknown_principal_has_no_authority(tg):
    assert tg.reconstructor.reconstruct("agent-ghost").paths == []
