"""Rejected delegations never reach the projection (authoritative layer decides)."""

from tests.conftest import delegate
from trustgraph.seed import CRM_READ


def test_rejected_delegation_is_not_projected(neo4j_store, tg):
    before = len([n for n in tg.graph_snapshot()["nodes"] if n["type"] == "Delegation"])
    assert not delegate(tg, "agent-intern", "agent-reporting", CRM_READ).accepted
    snapshot = tg.graph_snapshot(include_activity=0)
    assert len([n for n in snapshot["nodes"] if n["type"] == "Delegation"]) == before
    neo4j_store.sync(snapshot)
    with neo4j_store.client.session() as session:
        count = session.run("MATCH (d:Delegation)-[:DELEGATED_TO]->(:Agent {id: 'agent-reporting'}) "
                            "<-[:FROM]-(:Agent {id: 'agent-intern'}) RETURN count(d) AS c").single()["c"]
    assert count == 0
