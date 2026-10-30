"""Identity, capability and resource validation (pipeline steps 1-3)."""

from tests.conftest import authorize
from trustgraph.authorization.models import Decision
from trustgraph.identity.models import PrincipalStatus


def test_registered_agent_with_authority_is_allowed(tg):
    decision = authorize(tg, "agent-research", "file.read", "file:///research/report.pdf", "read")
    assert decision.decision == Decision.ALLOW
    assert [step.step for step in decision.trace][:4] == ["identity", "capability", "resource", "authority"]


def test_unknown_agent_is_denied(tg):
    decision = authorize(tg, "agent-ghost", "calculator.execute", "tool://calculator", "execute")
    assert decision.decision == Decision.DENY
    assert "Unknown agent" in decision.reason


def test_users_cannot_request_tool_actions(tg):
    decision = authorize(tg, "u-bayo", "database.read", "db://crm/customers", "read")
    assert decision.decision == Decision.DENY
    assert "Only registered AI agents" in decision.reason


def test_suspended_agent_is_denied(tg):
    tg.identity.set_status("agent-research", PrincipalStatus.SUSPENDED)
    decision = authorize(tg, "agent-research", "file.read", "file:///research/report.pdf", "read")
    assert decision.decision == Decision.DENY
    assert "suspended" in decision.reason


def test_missing_technical_capability_is_denied(tg):
    decision = authorize(tg, "agent-research", "payments.execute", "payments://treasury", "transfer")
    assert decision.decision == Decision.DENY
    assert "technical capability" in decision.reason


def test_unregistered_resource_is_denied(tg):
    decision = authorize(tg, "agent-research", "file.read", "file:///etc/passwd", "read")
    assert decision.decision == Decision.DENY
    assert "not a registered protected resource" in decision.reason


def test_action_not_defined_for_resource_is_denied(tg):
    decision = authorize(tg, "agent-research", "file.read", "file:///research/vendor-brief.txt", "write")
    assert decision.decision == Decision.DENY
    assert decision.trace[-1].step == "action"


def test_credential_for_another_agent_is_rejected(tg):
    decision = authorize(
        tg, "agent-finance", "database.read", "db://crm/customers", "read",
        authenticated_principal_id="agent-intern",
    )
    assert decision.decision == Decision.DENY
    assert "identity misuse" in decision.reason


def test_agent_api_key_authenticates_only_its_owner(empty_tg):
    from trustgraph.capability.models import Capability
    from trustgraph.identity.models import Principal, PrincipalKind

    empty_tg.catalog.register_capability(Capability(name="calculator.execute", actions=["execute"]))
    empty_tg.identity.register(Principal(id="u-owner", kind=PrincipalKind.USER, name="Owner"))
    _, key = empty_tg.identity.register(
        Principal(id="agent-x", kind=PrincipalKind.AGENT, name="X", owner_id="u-owner",
                  capabilities=["calculator.execute"])
    )
    assert key and key.startswith("tg_agent-x_")
    assert empty_tg.identity.authenticate(key).id == "agent-x"
    assert empty_tg.identity.authenticate(key + "tampered") is None


def test_agents_require_an_accountable_owner(empty_tg):
    import pytest

    from trustgraph.errors import ValidationError
    from trustgraph.identity.models import Principal, PrincipalKind

    with pytest.raises(ValidationError):
        empty_tg.identity.register(Principal(id="agent-orphan", kind=PrincipalKind.AGENT, name="Orphan"))
