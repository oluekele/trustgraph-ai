def test_capabilities_are_linked_to_agents(neo4j_store, tg):
    neo4j_store.sync(tg.graph_snapshot(include_activity=0))
    with neo4j_store.client.session() as session:
        caps = sorted(
            record["name"]
            for record in session.run(
                "MATCH (:Agent {id: 'agent-finance'})-[:HAS_CAPABILITY]->(c:Capability) RETURN c.label AS name"
            )
        )
    assert caps == ["calculator.execute", "database.read", "email.send", "payments.execute"]
