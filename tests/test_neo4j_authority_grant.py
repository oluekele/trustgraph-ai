def test_direct_grants_target_their_resource(neo4j_store, tg):
    neo4j_store.sync(tg.graph_snapshot(include_activity=0))
    with neo4j_store.client.session() as session:
        resources = {
            record["r"]
            for record in session.run(
                "MATCH (:User {id: 'u-ada'})-[:HOLDS]->(:AuthorityGrant)-[:TARGETS]->(r:Resource) RETURN r.id AS r"
            )
        }
    assert resources == {"res:file:///hr/salaries.csv", "res:payments://treasury"}
