"""Effective authority reconstructed across chains."""

from tests.conftest import delegate
from trustgraph.seed import CALC, CRM_READ, VENDOR_PAY


def test_effective_authority_unions_direct_and_delegated(tg):
    authority = tg.reconstructor.reconstruct("agent-research")
    kinds = {path.permission.capability: path.is_direct for path in authority.paths}
    assert kinds["calculator.execute"] is True     # direct grant
    assert kinds["web.search"] is False            # via u-chioma


def test_multiple_paths_are_all_reported(tg):
    assert delegate(tg, "agent-orchestrator", "agent-support", CRM_READ).accepted
    paths = tg.reconstructor.reconstruct("agent-support").paths_for(CRM_READ)
    assert sorted(path.hops for path in paths) == [1, 2]
    assert {path.root_principal_id for path in paths} == {"u-efe", "u-bayo"}


def test_end_agent_holds_exactly_what_was_delegated(tg):
    authority = tg.reconstructor.reconstruct("agent-finance")
    assert authority.permissions() == {CRM_READ, VENDOR_PAY, CALC}
