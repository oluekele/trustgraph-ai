"""Delegation-chain abuse: gradual expansion through several agents is impossible."""

from tests.conftest import authorize, delegate
from trustgraph.authorization.models import Decision
from trustgraph.capability.models import Permission
from trustgraph.seed import CRM_READ, FORECAST_READ


def test_each_hop_is_checked_against_the_previous_holder(tg):
    assert delegate(tg, "agent-orchestrator", "agent-intern", CRM_READ, depth=1).accepted
    notes = Permission(capability="database.read", resource="db://crm/customer_notes", action="read")
    assert not delegate(tg, "agent-intern", "agent-reporting", notes).accepted


def test_policy_hop_limit_applies_to_long_chains(tg):
    assert delegate(tg, "agent-orchestrator", "agent-reporting", FORECAST_READ).accepted
    decision = authorize(tg, "agent-reporting", "file.read", "file:///finance/forecast.csv", "read")
    assert decision.decision == Decision.DENY
    assert "exceeds limit 1" in decision.reason


def test_authority_requires_an_unbroken_valid_chain(tg, world):
    tg.delegations.revoke_delegation(world.delegation_ids["orchestrator->finance"])
    tg.commit()
    assert authorize(tg, "agent-reporting", "database.read", "db://crm/customers", "read").decision == Decision.DENY
    # Upstream holders are unaffected.
    assert authorize(tg, "agent-orchestrator", "database.read", "db://crm/customers", "read").decision.permits_execution
