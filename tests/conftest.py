"""Shared fixtures: every test gets its own freshly seeded, isolated world."""

import os
from datetime import timedelta

import pytest

from evaluation.systems import TrustGraphSystem
from trustgraph.authorization.models import AuthorizationRequest, RequestContext
from trustgraph.capability.models import Permission
from trustgraph.common import utc_now
from trustgraph.delegation.models import DelegationRequest
from trustgraph.persistence.database import create_database_engine, create_schema, make_session_factory
from trustgraph.service import TrustGraph


@pytest.fixture
def world() -> TrustGraphSystem:
    system = TrustGraphSystem.build()
    yield system
    system.tg.repository.session.close()


@pytest.fixture
def tg(world) -> TrustGraph:
    return world.tg


@pytest.fixture
def empty_tg() -> TrustGraph:
    engine = create_database_engine("sqlite://")
    create_schema(engine)
    with make_session_factory(engine)() as session:
        yield TrustGraph(session)


def execute(tg: TrustGraph, agent: str, tool: str, arguments: dict, purpose: str | None = "Routine task", **context):
    result = tg.enforcer.execute(agent, tool, arguments, RequestContext(purpose=purpose, **context))
    tg.commit()
    return result


def authorize(tg: TrustGraph, agent: str, capability: str, resource: str, action: str, purpose="Routine task", **extra):
    decision = tg.authorize(
        AuthorizationRequest(
            agent_id=agent,
            capability=capability,
            resource=resource,
            action=action,
            context=RequestContext(purpose=purpose),
            **extra,
        )
    )
    tg.commit()
    return decision


def delegate(tg: TrustGraph, delegator: str, delegatee: str, *grants: Permission, depth: int = 0, expires_in=None):
    result = tg.delegations.create_delegation(
        DelegationRequest(
            delegator_id=delegator,
            delegatee_id=delegatee,
            grants=list(grants),
            purpose="test",
            max_redelegation_depth=depth,
            expires_at=utc_now() + expires_in if expires_in else None,
        )
    )
    tg.commit()
    return result


def expire(tg: TrustGraph, delegation_id: str) -> None:
    delegation = tg.repository.get_delegation(delegation_id)
    tg.repository.update_delegation(delegation.model_copy(update={"expires_at": utc_now() - timedelta(seconds=1)}))
    tg.commit()


NEO4J_TEST_URI = os.getenv("TRUSTGRAPH_TEST_NEO4J_URI", "neo4j://localhost:7688")
NEO4J_TEST_PASSWORD = os.getenv("TRUSTGRAPH_TEST_NEO4J_PASSWORD", "trustgraph-test")


@pytest.fixture(scope="session")
def neo4j_store():
    """A GraphStore against a disposable Neo4j instance; skipped when unavailable."""
    from graph.client import Neo4jClient
    from graph.store import GraphStore

    try:
        client = Neo4jClient(uri=NEO4J_TEST_URI, username="neo4j", password=NEO4J_TEST_PASSWORD, database="neo4j")
        client.verify_connectivity()
    except Exception as exc:  # pragma: no cover - depends on environment
        pytest.skip(f"Neo4j test instance unavailable: {exc}")
    store = GraphStore(client)
    store.ensure_constraints()
    yield store
    with client.session() as session:
        session.run("MATCH (n:TG) DETACH DELETE n")
    client.close()
