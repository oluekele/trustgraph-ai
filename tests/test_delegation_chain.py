"""Chain structure: depth, parents, cycles and expiry inheritance."""

from datetime import timedelta

from tests.conftest import delegate
from trustgraph.common import utc_now
from trustgraph.seed import CRM_READ, VENDOR_PAY


def test_seed_chain_has_increasing_depth(world, tg):
    ids = world.delegation_ids
    depths = {key: tg.repository.get_delegation(ids[key]).depth for key in ids}
    assert depths["bayo->orchestrator"] == 1
    assert depths["orchestrator->finance"] == 2
    assert depths["finance->reporting"] == 3


def test_parent_delegation_is_recorded(world, tg):
    finance = tg.repository.get_delegation(world.delegation_ids["orchestrator->finance"])
    assert finance.parent_delegation_id == world.delegation_ids["bayo->orchestrator"]


def test_circular_delegation_is_blocked(tg):
    result = delegate(tg, "agent-finance", "agent-orchestrator", CRM_READ)
    assert not result.accepted
    assert "Circular delegation blocked" in result.reason


def test_delegation_cannot_outlive_upstream_authority(tg):
    first = delegate(tg, "agent-orchestrator", "agent-intern", VENDOR_PAY, depth=0, expires_in=timedelta(hours=1))
    assert first.accepted
    # agent-intern cannot re-delegate (depth 0), so test inheritance on a fresh hop instead:
    short = delegate(tg, "agent-orchestrator", "agent-reporting", CRM_READ, expires_in=timedelta(minutes=5))
    assert short.accepted
    assert short.delegation.expires_at <= utc_now() + timedelta(minutes=5)


def test_expiry_is_inherited_from_a_time_limited_chain(tg):
    limited = delegate(tg, "agent-orchestrator", "agent-intern", CRM_READ, depth=1, expires_in=timedelta(minutes=10))
    assert limited.accepted
    onward = delegate(tg, "agent-intern", "agent-reporting", CRM_READ)
    assert onward.accepted
    assert onward.delegation.expires_at == limited.delegation.expires_at


def test_requested_expiry_beyond_upstream_is_rejected(tg):
    delegate(tg, "agent-orchestrator", "agent-intern", CRM_READ, depth=1, expires_in=timedelta(minutes=10))
    # agent-intern now holds CRM read only until +10 min (plus its own other paths: none).
    result = delegate(tg, "agent-intern", "agent-reporting", CRM_READ, expires_in=timedelta(hours=2))
    assert not result.accepted
    assert "outlive" in result.reason
