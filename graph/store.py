"""Neo4j projection of the authority graph.

The relational store is authoritative; Neo4j holds a projection used for
relationship-heavy provenance queries (proposal §8.14). Every node carries
the ``TG`` label so a full resync never touches unrelated data. Labels and
relationship types are interpolated only from fixed whitelists.
"""

import logging
import threading
from collections import defaultdict
from time import perf_counter
from typing import Any

from graph.client import Neo4jClient

logger = logging.getLogger(__name__)

NODE_LABELS = {"User", "Agent", "Capability", "Resource", "AuthorityGrant", "Delegation"}
RELATIONSHIP_TYPES = {
    "OWNS",
    "HAS_CAPABILITY",
    "HOLDS",
    "TARGETS",
    "FROM",
    "DELEGATED_TO",
    "GRANTS",
    "EXECUTED",
    "BLOCKED",
}


class GraphStore:
    def __init__(self, client: Neo4jClient):
        self.client = client

    def ensure_constraints(self) -> None:
        with self.client.session() as session:
            for label in sorted(NODE_LABELS):
                session.run(
                    f"CREATE CONSTRAINT tg_{label.lower()}_id IF NOT EXISTS "
                    f"FOR (n:{label}) REQUIRE n.id IS UNIQUE"
                )

    def sync(self, snapshot: dict[str, Any]) -> dict[str, int]:
        """Replace the projection with ``snapshot`` atomically."""
        nodes_by_label: dict[str, list[dict]] = defaultdict(list)
        for node in snapshot["nodes"]:
            if node["type"] not in NODE_LABELS:
                continue
            nodes_by_label[node["type"]].append(
                {"id": node["id"], "props": {k: v for k, v in node.items() if k != "type"}}
            )
        edges_by_type: dict[str, list[dict]] = defaultdict(list)
        for edge in snapshot["edges"]:
            if edge["type"] not in RELATIONSHIP_TYPES:
                continue
            edges_by_type[edge["type"]].append(
                {
                    "source": edge["source"],
                    "target": edge["target"],
                    "props": {k: v for k, v in edge.items() if k not in ("source", "target", "type")},
                }
            )

        def work(tx):
            tx.run("MATCH (n:TG) DETACH DELETE n")
            for label, rows in nodes_by_label.items():
                tx.run(
                    f"UNWIND $rows AS row CREATE (n:TG:{label} {{id: row.id}}) SET n += row.props",
                    rows=rows,
                )
            for rel_type, rows in edges_by_type.items():
                tx.run(
                    "UNWIND $rows AS row "
                    "MATCH (a:TG {id: row.source}) MATCH (b:TG {id: row.target}) "
                    f"CREATE (a)-[r:{rel_type}]->(b) SET r += row.props",
                    rows=rows,
                )

        with self.client.session() as session:
            session.execute_write(work)
        return {
            "nodes": sum(len(rows) for rows in nodes_by_label.values()),
            "relationships": sum(len(rows) for rows in edges_by_type.values()),
        }

    def delegation_chains(self, agent_id: str) -> tuple[list[dict[str, Any]], float]:
        """Every active chain from a human root to ``agent_id`` with query latency (ms)."""
        query = """
        MATCH path = (root:User)-[:FROM|DELEGATED_TO*2..20]->(agent:Agent {id: $agent_id})
        WHERE all(r IN relationships(path) WHERE r.status = 'active')
        RETURN [n IN nodes(path) | {id: n.id, labels: labels(n), label: n.label}] AS nodes
        """
        started = perf_counter()
        with self.client.session() as session:
            records = list(session.run(query, agent_id=agent_id))
        latency = (perf_counter() - started) * 1000
        chains = []
        for record in records:
            nodes = record["nodes"]
            chains.append(
                {
                    "root": nodes[0]["id"],
                    "principals": [n["id"] for n in nodes if "Delegation" not in n["labels"]],
                    "delegations": [n["id"].removeprefix("dlg:") for n in nodes if "Delegation" in n["labels"]],
                }
            )
        return chains, latency

    def blast_radius(self, principal_id: str) -> tuple[list[str], float]:
        """Agents whose authority depends on ``principal_id`` (impact of compromise/revocation)."""
        query = """
        MATCH (start:TG {id: $principal_id})-[:FROM|DELEGATED_TO*2..20]->(agent:Agent)
        WHERE agent.id <> $principal_id
        RETURN DISTINCT agent.id AS agent ORDER BY agent
        """
        started = perf_counter()
        with self.client.session() as session:
            agents = [record["agent"] for record in session.run(query, principal_id=principal_id)]
        return agents, (perf_counter() - started) * 1000

    def counts(self) -> dict[str, int]:
        with self.client.session() as session:
            record = session.run(
                "MATCH (n:TG) WITH count(n) AS nodes "
                "OPTIONAL MATCH (:TG)-[r]->(:TG) RETURN nodes, count(r) AS relationships"
            ).single()
        return {"nodes": record["nodes"], "relationships": record["relationships"]}


class GraphProjector:
    """Best-effort projector: Neo4j failures never affect authorisation."""

    def __init__(self, store: GraphStore | None):
        self.store = store
        self.last_error: str | None = None
        self.last_sync: dict[str, int] | None = None
        # Syncs replace the whole projection; concurrent ones would interleave.
        self._lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return self.store is not None

    def sync(self, snapshot: dict[str, Any]) -> bool:
        if self.store is None:
            return False
        try:
            with self._lock:
                self.last_sync = self.store.sync(snapshot)
            self.last_error = None
            return True
        except Exception as exc:  # projection is non-authoritative
            self.last_error = f"{type(exc).__name__}: {exc}"
            logger.warning("Neo4j projection failed: %s", self.last_error)
            return False


def build_projector(enabled: bool) -> GraphProjector:
    if not enabled:
        return GraphProjector(None)
    try:
        client = Neo4jClient()
        client.verify_connectivity()
        store = GraphStore(client)
        store.ensure_constraints()
        return GraphProjector(store)
    except Exception as exc:
        logger.warning("Neo4j unavailable, graph projection disabled: %s", exc)
        projector = GraphProjector(None)
        projector.last_error = f"{type(exc).__name__}: {exc}"
        return projector
