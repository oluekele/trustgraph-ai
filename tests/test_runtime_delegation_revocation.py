"""Revoked or expired authority cannot authorise new protected actions."""

from tests.conftest import execute, expire


def test_revocation_blocks_the_next_action_immediately(tg, world):
    assert execute(tg, "agent-reporting", "crm_query", {"table": "customers"}).executed
    tg.delegations.revoke_delegation(world.delegation_ids["finance->reporting"])
    tg.commit()
    result = execute(tg, "agent-reporting", "crm_query", {"table": "customers"})
    assert result.status == "blocked"
    assert "no authority grant" in result.decision.reason


def test_expired_delegation_blocks_execution(tg, world):
    expire(tg, world.delegation_ids["efe->support"])
    result = execute(tg, "agent-support", "crm_query", {"table": "customer_notes"})
    assert result.status == "blocked"


def test_revocation_does_not_affect_unrelated_agents(tg, world):
    tg.delegations.revoke_delegation(world.delegation_ids["chioma->research"])
    tg.commit()
    assert execute(tg, "agent-support", "crm_query", {"table": "customer_notes"}).executed
    # agent-research keeps its own direct grants.
    assert execute(tg, "agent-research", "calculator", {"expression": "2+2"}).executed
