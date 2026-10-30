"""Risk bands drive ALLOW / RESTRICT / REQUIRE_APPROVAL / DENY."""

from tests.conftest import execute
from trustgraph.authorization.models import Decision


def test_low_risk_is_allowed(tg):
    assert execute(tg, "agent-research", "file_reader", {"path": "/research/report.pdf"}).decision.decision == Decision.ALLOW


def test_medium_risk_is_restricted(tg):
    result = execute(tg, "agent-support", "crm_update", {"record_ids": ["C-1001", "C-1002"], "changes": {"tier": "gold"}},
                     purpose="Ticket #12")
    assert result.decision.decision == Decision.RESTRICT
    assert result.decision.restrictions["max_affected_records"] == 1
    assert result.output["updated"] == ["C-1001"]
    assert result.output["skipped_by_restriction"] == ["C-1002"]


def test_high_risk_requires_approval_and_does_not_execute(tg):
    before = len(tg.tools.sandbox.deployments)
    result = execute(tg, "agent-devops", "deploy_service",
                     {"service": "billing", "version": "2", "environment": "production"}, purpose="Release")
    assert result.decision.decision == Decision.REQUIRE_APPROVAL
    assert result.status == "pending_approval"
    assert len(tg.tools.sandbox.deployments) == before


def test_critical_risk_is_denied_even_where_policy_would_ask_for_approval(tg):
    result = execute(tg, "agent-devops", "deploy_service",
                     {"service": "billing", "version": "2", "environment": "production"},
                     purpose="Release", untrusted_input=True)
    assert result.decision.decision == Decision.DENY
    assert result.decision.risk.level == "critical"
    assert "Critical runtime risk" in result.decision.reason
