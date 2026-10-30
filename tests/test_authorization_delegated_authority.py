"""Authorisation decisions carry delegated-authority provenance."""

from tests.conftest import authorize
from trustgraph.authorization.models import Decision


def test_delegated_decision_identifies_the_accountable_human(tg):
    decision = authorize(tg, "agent-orchestrator", "database.read", "db://crm/customers", "read")
    assert decision.decision == Decision.ALLOW
    assert decision.on_behalf_of == "u-bayo"
    assert decision.authority_path.hops == 1


def test_direct_authority_has_no_chain(tg):
    decision = authorize(tg, "agent-research", "calculator.execute", "tool://calculator", "execute")
    assert decision.authority_path.is_direct
    assert decision.on_behalf_of == "agent-research"


def test_delegation_increases_risk(tg):
    one_hop = authorize(tg, "agent-orchestrator", "database.read", "db://crm/customers", "read")
    three_hop = authorize(tg, "agent-reporting", "database.read", "db://crm/customers", "read")
    assert three_hop.risk.factors.delegation_risk > one_hop.risk.factors.delegation_risk
    assert three_hop.risk.score > one_hop.risk.score
