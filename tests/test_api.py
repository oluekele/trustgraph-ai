"""HTTP layer: service-token auth, agent-key auth, error mapping."""

import pytest
from fastapi.testclient import TestClient

from trustgraph.api import build_runtime, create_app
from trustgraph.settings import Settings


@pytest.fixture
def client():
    settings = Settings(
        TRUSTGRAPH_DATABASE_URL="sqlite://",
        TRUSTGRAPH_SERVICE_TOKEN="test-token",
        TRUSTGRAPH_NEO4J_ENABLED=False,
    )
    app = create_app(build_runtime(settings))
    with TestClient(app) as test_client:
        yield test_client


SERVICE = {"X-Service-Token": "test-token", "X-Operator-Id": "ops@acme.example"}


def test_health_is_public(client):
    assert client.get("/health").json()["status"] == "ok"


def test_service_token_is_required(client):
    assert client.get("/overview").status_code == 401
    assert client.get("/overview", headers={"X-Service-Token": "wrong"}).status_code == 401
    assert client.get("/overview", headers=SERVICE).status_code == 200


def test_agents_authenticate_with_their_own_key(client):
    keys = client.get("/admin/seed-keys", headers=SERVICE).json()
    body = {"agent_id": "agent-research", "tool": "calculator", "arguments": {"expression": "2+3"}}
    ok = client.post("/execute", json=body, headers={"X-Agent-Key": keys["agent-research"]})
    assert ok.status_code == 200 and ok.json()["output"]["result"] == 5
    impersonation = client.post("/execute", json=body, headers={"X-Agent-Key": keys["agent-intern"]})
    assert impersonation.json()["status"] == "blocked"
    assert client.post("/execute", json=body, headers={"X-Agent-Key": "bogus"}).status_code == 401


def test_errors_map_to_http_status(client):
    assert client.get("/principals/nobody", headers=SERVICE).status_code == 404
    duplicate = {"id": "pol-hr-deny", "name": "dup"}
    assert client.post("/policies", json=duplicate, headers=SERVICE).status_code == 409


def test_rejected_delegation_returns_200_with_violations(client):
    response = client.post(
        "/delegations",
        json={"delegator_id": "agent-intern", "delegatee_id": "agent-reporting",
              "grants": [{"capability": "database.read", "resource": "db://crm/customers", "action": "read"}]},
        headers=SERVICE,
    )
    assert response.status_code == 200
    assert response.json()["accepted"] is False


def test_operator_identity_is_recorded_on_approvals(client):
    pending = client.post(
        "/execute",
        json={"agent_id": "agent-finance", "tool": "payment_transfer",
              "arguments": {"account": "vendor-payouts", "recipient": "NW", "amount": 5},
              "context": {"purpose": "Invoice"}},
        headers=SERVICE,
    ).json()
    approval_id = pending["decision"]["approval_id"]
    decided = client.post(f"/approvals/{approval_id}/approve", json={"note": "ok"}, headers=SERVICE).json()
    assert decided["decided_by"] == "ops@acme.example"
    executed = client.post(f"/approvals/{approval_id}/execute", headers=SERVICE).json()
    assert executed["status"] == "executed"
    assert client.get("/audit/verify", headers=SERVICE).json()["valid"]
