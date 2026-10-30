"""Provenance queries over the projected graph."""


def test_delegation_chain_query_finds_the_three_hop_chain(neo4j_store, tg, world):
    neo4j_store.sync(tg.graph_snapshot(include_activity=0))
    chains, latency = neo4j_store.delegation_chains("agent-reporting")
    principals = {tuple(chain["principals"]) for chain in chains}
    assert ("u-bayo", "agent-orchestrator", "agent-finance", "agent-reporting") in principals
    assert latency >= 0


def test_blast_radius_of_an_upstream_agent(neo4j_store, tg):
    neo4j_store.sync(tg.graph_snapshot(include_activity=0))
    dependents, _ = neo4j_store.blast_radius("agent-orchestrator")
    assert set(dependents) == {"agent-finance", "agent-reporting"}
