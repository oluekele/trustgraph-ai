"""Delegated grants must match the delegator's authority exactly."""

from tests.conftest import delegate
from trustgraph.capability.models import Permission
from trustgraph.seed import CRM_READ, FORECAST_READ


def test_exact_held_grant_can_be_delegated(tg):
    assert delegate(tg, "agent-orchestrator", "agent-reporting", FORECAST_READ).accepted


def test_same_capability_and_resource_but_different_action_is_rejected(tg):
    write = Permission(capability="file.write", resource="file:///finance/forecast.csv", action="write")
    result = delegate(tg, "agent-orchestrator", "agent-reporting", write)
    assert not result.accepted
    assert "does not hold the exact authority" in result.reason


def test_same_capability_and_action_but_different_resource_is_rejected(tg):
    notes = Permission(capability="database.read", resource="db://crm/customer_notes", action="read")
    result = delegate(tg, "agent-orchestrator", "agent-reporting", notes)
    assert not result.accepted


def test_one_invalid_grant_rejects_the_whole_delegation(tg):
    notes = Permission(capability="database.read", resource="db://crm/customer_notes", action="read")
    result = delegate(tg, "agent-orchestrator", "agent-intern", CRM_READ, notes)
    assert not result.accepted
    assert tg.repository.list_delegations("agent-intern") == []


def test_delegated_resources_are_canonicalised(tg):
    spelled = Permission(capability="database.read", resource="db://CRM/customers/", action="read")
    result = delegate(tg, "agent-orchestrator", "agent-intern", spelled)
    assert result.accepted
    assert result.delegation.grants[0].resource == "db://crm/customers"
