def test_delegations_connect_delegator_and_delegatee(neo4j_store, tg, world):
    neo4j_store.sync(tg.graph_snapshot(include_activity=0))
    delegation_node = "dlg:" + world.delegation_ids["orchestrator->finance"]
    with neo4j_store.client.session() as session:
        record = session.run(
            "MATCH (a)-[:FROM]->(d:Delegation {id: $id})-[:DELEGATED_TO]->(b) RETURN a.id AS a, b.id AS b",
            id=delegation_node,
        ).single()
    assert (record["a"], record["b"]) == ("agent-orchestrator", "agent-finance")
