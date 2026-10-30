"""Revoked links are projected with their status so active-chain queries exclude them."""


def test_revoked_chain_is_excluded_from_active_chains(neo4j_store, tg, world):
    tg.delegations.revoke_delegation(world.delegation_ids["orchestrator->finance"])
    neo4j_store.sync(tg.graph_snapshot(include_activity=0))
    chains, _ = neo4j_store.delegation_chains("agent-reporting")
    assert all("agent-finance" not in chain["principals"] for chain in chains)
