"""Atomic authority = capability + resource + action; capability alone grants nothing."""

import pytest

from tests.conftest import authorize
from trustgraph.authorization.models import Decision
from trustgraph.capability.models import Permission
from trustgraph.errors import ValidationError


def test_capability_without_grant_is_denied(tg):
    # agent-intern can technically query databases but holds no CRM authority.
    decision = authorize(tg, "agent-intern", "database.read", "db://crm/customers", "read")
    assert decision.decision == Decision.DENY
    assert "capability does not imply authority" in decision.reason


def test_grant_for_one_resource_does_not_cover_another(tg):
    # agent-reporting holds customers.read, not customer_notes.read.
    assert authorize(tg, "agent-reporting", "database.read", "db://crm/customers", "read").decision.permits_execution
    assert authorize(tg, "agent-reporting", "database.read", "db://crm/customer_notes", "read").decision == Decision.DENY


def test_grant_for_one_action_does_not_cover_another(tg):
    # agent-research may write notes.txt but only read report.pdf.
    assert authorize(tg, "agent-research", "file.write", "file:///research/notes.txt", "write").decision.permits_execution
    assert authorize(tg, "agent-research", "file.write", "file:///research/report.pdf", "write").decision == Decision.DENY


def test_direct_grant_requires_matching_technical_capability(tg):
    with pytest.raises(ValidationError, match="technical capability"):
        tg.direct_authority.grant("agent-research", Permission(
            capability="payments.execute", resource="payments://vendor-payouts", action="transfer"))


def test_direct_grant_rejects_malformed_tuples(tg):
    with pytest.raises(ValidationError, match="not defined for resource"):
        tg.direct_authority.grant("u-bayo", Permission(
            capability="database.write", resource="file:///reports/weekly.md", action="update"))


def test_duplicate_direct_grant_is_rejected(tg):
    with pytest.raises(ValidationError, match="already holds"):
        tg.direct_authority.grant("u-bayo", Permission(
            capability="database.read", resource="db://crm/customers", action="read"))


def test_revoked_direct_grant_stops_authorising(tg):
    grant = next(g for g in tg.direct_authority.list("agent-research") if g.capability == "calculator.execute")
    assert authorize(tg, "agent-research", "calculator.execute", "tool://calculator", "execute").decision == Decision.ALLOW
    tg.revoke_grant(grant.id, "admin")
    tg.commit()
    assert authorize(tg, "agent-research", "calculator.execute", "tool://calculator", "execute").decision == Decision.DENY
