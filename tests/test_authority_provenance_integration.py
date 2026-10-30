"""Audit events reconstruct authority → delegation → agent → action → decision → execution."""

from tests.conftest import execute


def test_executed_delegated_action_has_complete_provenance(tg, world):
    result = execute(tg, "agent-reporting", "crm_query", {"table": "customers"})
    events = tg.repository.list_audit_events(request_id=result.request_id, ascending=True)
    authorization, execution = events
    assert authorization.event_type == "authorization"
    assert execution.event_type == "execution"
    assert authorization.on_behalf_of == "u-bayo"
    assert authorization.principal_chain == ["u-bayo", "agent-orchestrator", "agent-finance", "agent-reporting"]
    assert authorization.delegation_chain == [
        world.delegation_ids["bayo->orchestrator"],
        world.delegation_ids["orchestrator->finance"],
        world.delegation_ids["finance->reporting"],
    ]
    assert execution.execution_status == "restricted"
    assert authorization.risk_factors["delegation_risk"] == 75.0


def test_graph_snapshot_links_people_agents_and_resources(tg):
    graph = tg.graph_snapshot()
    edges = {(edge["source"], edge["type"], edge["target"]) for edge in graph["edges"]}
    assert ("u-bayo", "OWNS", "agent-orchestrator") in edges
    assert any(source == "u-bayo" and kind == "FROM" for source, kind, _ in edges)
    assert any(kind == "DELEGATED_TO" and target == "agent-reporting" for _, kind, target in edges)
    node_types = {node["type"] for node in graph["nodes"]}
    assert node_types >= {"User", "Agent", "Capability", "Resource", "AuthorityGrant", "Delegation"}
