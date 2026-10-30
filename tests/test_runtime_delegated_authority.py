"""Governed execution with delegated authority."""

from tests.conftest import delegate, execute
from trustgraph.seed import CRM_READ


def test_newly_delegated_agent_can_execute(tg):
    assert execute(tg, "agent-intern", "crm_query", {"table": "customers"}).status == "blocked"
    assert delegate(tg, "agent-orchestrator", "agent-intern", CRM_READ).accepted
    result = execute(tg, "agent-intern", "crm_query", {"table": "customers", "limit": 2})
    assert result.executed
    assert result.decision.authority_path.principals == ["u-bayo", "agent-orchestrator", "agent-intern"]


def test_restricted_execution_limits_and_redacts_output(tg):
    result = execute(tg, "agent-reporting", "crm_query", {"table": "customers", "limit": 50})
    assert result.status == "restricted"
    rows = result.output["rows"]
    assert len(rows) <= 5
    assert all(row["email"] == "[redacted]" for row in rows)
