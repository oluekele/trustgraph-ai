"""Policy precedence: explicit deny > approval > allow > default deny; conditions."""

from datetime import datetime, timezone

from tests.conftest import authorize
from trustgraph.authorization.models import AuthorizationRequest, Decision, RequestContext
from trustgraph.policy.engine import PolicyEngine
from trustgraph.policy.models import Policy, PolicyConditions, PolicyEffect
from trustgraph.seed import HR_READ

NOON = datetime(2026, 10, 13, 12, tzinfo=timezone.utc)


def request(**overrides):
    values = dict(agent_id="agent-a", capability="file.read", resource="file:///docs/a.txt", action="read")
    values.update(overrides)
    return AuthorizationRequest(**values)


def test_no_matching_policy_is_default_deny():
    result = PolicyEngine([]).evaluate(request(), None, None, NOON)
    assert result.effect is None and "default deny" in result.reason


def test_explicit_deny_beats_allow():
    engine = PolicyEngine([
        Policy(id="allow", name="Allow", effect=PolicyEffect.ALLOW),
        Policy(id="deny", name="Deny docs", effect=PolicyEffect.DENY, resources=["file:///docs/*"]),
    ])
    assert engine.evaluate(request(), None, None, NOON).effect == PolicyEffect.DENY


def test_approval_beats_allow():
    engine = PolicyEngine([
        Policy(id="allow", name="Allow", effect=PolicyEffect.ALLOW),
        Policy(id="approve", name="Approve", effect=PolicyEffect.REQUIRE_APPROVAL, actions=["read"]),
    ])
    assert engine.evaluate(request(), None, None, NOON).effect == PolicyEffect.REQUIRE_APPROVAL


def test_disabled_policies_are_ignored():
    engine = PolicyEngine([Policy(id="deny", name="Deny", effect=PolicyEffect.DENY, enabled=False),
                           Policy(id="allow", name="Allow")])
    assert engine.evaluate(request(), None, None, NOON).effect == PolicyEffect.ALLOW


def test_wildcards_match_resources_only_by_pattern():
    engine = PolicyEngine([Policy(id="allow", name="Docs", resources=["file:///docs/*"])])
    assert engine.evaluate(request(), None, None, NOON).effect == PolicyEffect.ALLOW
    assert engine.evaluate(request(resource="file:///other/a.txt"), None, None, NOON).effect is None


def test_purpose_condition():
    engine = PolicyEngine([Policy(id="p", name="P", conditions=PolicyConditions(require_purpose=True))])
    assert engine.evaluate(request(), None, None, NOON).effect is None
    with_purpose = request(context=RequestContext(purpose="Quarterly close"))
    assert engine.evaluate(with_purpose, None, None, NOON).effect == PolicyEffect.ALLOW


def test_allowed_hours_condition_including_overnight_windows():
    office = PolicyEngine([Policy(id="p", name="P", conditions=PolicyConditions(allowed_hours_utc=(8, 18)))])
    night = PolicyEngine([Policy(id="p", name="P", conditions=PolicyConditions(allowed_hours_utc=(22, 6)))])
    assert office.evaluate(request(), None, None, NOON).effect == PolicyEffect.ALLOW
    assert night.evaluate(request(), None, None, NOON).effect is None
    assert night.evaluate(request(), None, None, NOON.replace(hour=23)).effect == PolicyEffect.ALLOW


def test_deny_policy_overrides_a_mistaken_direct_grant(tg):
    tg.direct_authority.grant("agent-research", HR_READ)
    decision = authorize(tg, "agent-research", "file.read", "file:///hr/salaries.csv", "read")
    assert decision.decision == Decision.DENY
    assert "HR data is off-limits" in decision.reason
    assert "pol-hr-deny" in decision.matched_policies


def test_subject_scoped_deny(tg):
    # Intern lockdown denies any write-like action for agent-intern only.
    from trustgraph.seed import CRM_UPDATE

    tg.direct_authority.grant("agent-intern", CRM_UPDATE)
    decision = authorize(tg, "agent-intern", "database.write", "db://crm/customers", "update")
    assert decision.decision == Decision.DENY
    assert "pol-intern-lockdown" in decision.matched_policies


def test_direct_authority_only_condition(tg):
    tg.repository.upsert_policy(Policy(
        id="pol-notes-direct", name="Notes: direct only", capabilities=["database.read"],
        resources=["db://crm/customer_notes"], conditions=PolicyConditions(direct_authority_only=True), priority=10,
    ))
    # Delegated authority no longer satisfies any applicable allow for notes? The broader CRM
    # read policy still applies, so the request remains allowed — conditions are per policy.
    decision = authorize(tg, "agent-support", "database.read", "db://crm/customer_notes", "read")
    assert decision.decision.permits_execution
    assert "pol-crm-read" in decision.matched_policies
