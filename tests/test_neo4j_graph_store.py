"""Full projection of the authoritative store into Neo4j."""


def test_sync_projects_every_node_and_relationship(neo4j_store, tg):
    snapshot = tg.graph_snapshot(include_activity=0)
    counts = neo4j_store.sync(snapshot)
    assert counts["nodes"] == len(snapshot["nodes"])
    assert counts["relationships"] == len(snapshot["edges"])
    assert neo4j_store.counts() == counts


def test_resync_replaces_rather_than_duplicates(neo4j_store, tg):
    snapshot = tg.graph_snapshot(include_activity=0)
    neo4j_store.sync(snapshot)
    neo4j_store.sync(snapshot)
    assert neo4j_store.counts()["nodes"] == len(snapshot["nodes"])
