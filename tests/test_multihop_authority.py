"""Human → A → B → C: authority narrows and depth shrinks along the chain."""

from tests.conftest import authorize, delegate
from trustgraph.authorization.models import Decision
from trustgraph.seed import CRM_READ


def test_three_hop_chain_authorises_the_end_agent(tg):
    decision = authorize(tg, "agent-reporting", "database.read", "db://crm/customers", "read")
    assert decision.decision.permits_execution
    path = decision.authority_path
    assert path.principals == ["u-bayo", "agent-orchestrator", "agent-finance", "agent-reporting"]
    assert path.hops == 3
    assert decision.on_behalf_of == "u-bayo"


def test_remaining_depth_decreases_per_hop(tg):
    depth = {
        agent: tg.reconstructor.reconstruct(agent).best_delegable_path(CRM_READ)
        for agent in ("u-bayo", "agent-orchestrator", "agent-finance", "agent-reporting")
    }
    assert depth["u-bayo"].remaining_depth == 3
    assert depth["agent-orchestrator"].remaining_depth == 2
    assert depth["agent-finance"].remaining_depth == 1
    assert depth["agent-reporting"] is None


def test_end_of_chain_cannot_extend_it(tg):
    result = delegate(tg, "agent-reporting", "agent-support", CRM_READ)
    assert not result.accepted


def test_chain_does_not_leak_sibling_permissions(tg):
    # finance received CRM read, vendor payments and calculator only.
    decision = authorize(tg, "agent-finance", "email.send", "email://external", "send")
    assert decision.decision == Decision.DENY
