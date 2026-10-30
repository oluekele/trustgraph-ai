"""Every delegated permission traces back to a root direct grant."""

from trustgraph.capability.models import Permission
from trustgraph.seed import CRM_READ


def test_provenance_explains_each_path(tg):
    report = tg.provenance("agent-reporting", CRM_READ)
    assert report["held"]
    explained = report["paths"][0]
    assert explained["root_grant"]["principal_id"] == "u-bayo"
    assert [d["delegatee_id"] for d in explained["delegations"]] == [
        "agent-orchestrator", "agent-finance", "agent-reporting",
    ]


def test_provenance_for_unheld_permission(tg):
    report = tg.provenance(
        "agent-reporting", Permission(capability="database.read", resource="db://crm/customer_notes", action="read")
    )
    assert report == {**report, "held": False, "paths": []}


def test_provenance_canonicalises_resource(tg):
    report = tg.provenance(
        "agent-reporting", Permission(capability="database.read", resource="DB://crm/customers/", action="read")
    )
    assert report["held"]


def test_every_path_starts_at_its_root_grant_holder(tg):
    for agent in ("agent-orchestrator", "agent-finance", "agent-reporting", "agent-support", "agent-research"):
        for path in tg.reconstructor.reconstruct(agent).paths:
            grant = tg.repository.get_grant(path.root_grant_id)
            assert grant.principal_id == path.root_principal_id == path.principals[0]
            assert path.principals[-1] == agent
            assert len(path.chain) == len(path.principals) - 1
