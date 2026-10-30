"""An agent must not delegate authority greater than its own effective authority."""

from tests.conftest import authorize, delegate
from trustgraph.authorization.models import Decision
from trustgraph.capability.models import Permission
from trustgraph.seed import CRM_READ, NOTES_READ, SEARCH, TREASURY_PAY

FORECAST_WRITE = Permission(capability="file.write", resource="file:///finance/forecast.csv", action="write")


def test_delegating_unheld_authority_is_blocked(tg):
    result = delegate(tg, "agent-intern", "agent-reporting", CRM_READ)
    assert not result.accepted
    assert "Privilege amplification blocked" in result.reason


def test_broader_action_is_blocked(tg):
    assert not delegate(tg, "agent-orchestrator", "agent-reporting", FORECAST_WRITE).accepted


def test_broader_resource_is_blocked(tg):
    assert not delegate(tg, "agent-orchestrator", "agent-reporting", NOTES_READ).accepted


def test_treasury_cannot_be_laundered_through_an_agent(tg):
    assert not delegate(tg, "agent-finance", "agent-orchestrator", TREASURY_PAY).accepted


def test_non_delegable_authority_cannot_be_passed_on(tg):
    # agent-research received search with max_redelegation_depth=0.
    result = delegate(tg, "agent-research", "agent-intern", SEARCH)
    assert not result.accepted
    assert "not permitted to delegate" in result.reason


def test_rejected_amplification_grants_nothing(tg):
    delegate(tg, "agent-orchestrator", "agent-reporting", FORECAST_WRITE)
    decision = authorize(tg, "agent-reporting", "file.write", "file:///finance/forecast.csv", "write")
    assert decision.decision == Decision.DENY


def test_requested_redelegation_depth_is_capped_not_amplified(tg):
    # orchestrator holds vendor payouts with 1 hop of headroom; asking for 5 is capped.
    from trustgraph.seed import VENDOR_PAY

    result = delegate(tg, "agent-orchestrator", "agent-intern", VENDOR_PAY, depth=5)
    assert result.accepted
    path = tg.reconstructor.reconstruct("agent-intern").best_path(VENDOR_PAY)
    assert path.remaining_depth == 0
