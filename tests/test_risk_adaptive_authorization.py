"""The same authority yields different decisions as runtime risk changes."""

from tests.conftest import authorize, execute
from trustgraph.authorization.models import Decision
from trustgraph.policy.models import Policy, PolicyConditions


def test_untrusted_context_turns_an_allowed_email_into_a_denial(tg):
    args = {"to": ["kwame@mail.example"], "subject": "Update", "body": "Your ticket is resolved."}
    clean = execute(tg, "agent-support", "send_email", args, purpose="Ticket follow-up")
    tainted = execute(tg, "agent-support", "send_email", args, purpose="Ticket follow-up", untrusted_input=True)
    assert clean.decision.decision.permits_execution
    assert tainted.decision.decision == Decision.DENY
    assert "exceeds limit 55" in tainted.decision.reason


def test_policy_risk_ceiling(tg):
    tg.repository.upsert_policy(Policy(
        id="pol-calc-ceiling", name="Calculator ceiling", capabilities=["calculator.execute"],
        conditions=PolicyConditions(max_risk_score=5), priority=1,
    ))
    tg.repository.upsert_policy(tg.repository.get_policy("pol-baseline-tools").model_copy(update={"enabled": False}))
    decision = authorize(tg, "agent-research", "calculator.execute", "tool://calculator", "execute")
    assert decision.decision == Decision.DENY


def test_more_hops_more_restriction(tg):
    one = authorize(tg, "agent-orchestrator", "database.read", "db://crm/customers", "read")
    three = authorize(tg, "agent-reporting", "database.read", "db://crm/customers", "read")
    assert one.decision == Decision.ALLOW
    assert three.decision == Decision.RESTRICT
