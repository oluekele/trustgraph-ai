"""Neo4j connectivity (skipped when no test instance is reachable)."""


def test_neo4j_connection(neo4j_store):
    neo4j_store.client.verify_connectivity()
    with neo4j_store.client.session() as session:
        assert session.run("RETURN 1 AS one").single()["one"] == 1


def test_disabled_projector_never_fails():
    from graph.store import GraphProjector

    projector = GraphProjector(None)
    assert not projector.enabled
    assert projector.sync({"nodes": [], "edges": []}) is False
