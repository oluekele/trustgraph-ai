"""Unauthorised actions never reach the protected tool."""

import pytest

from ai_agent.tools.registry import ToolBypassError
from tests.conftest import execute
from trustgraph.authorization.models import RequestContext


def test_denied_action_has_no_side_effect(tg):
    before = len(tg.tools.sandbox.ledger)
    result = execute(tg, "agent-finance", "payment_transfer",
                     {"account": "treasury", "recipient": "X", "amount": 1.0}, purpose="Invoice")
    assert result.status == "blocked"
    assert result.output is None
    assert len(tg.tools.sandbox.ledger) == before


def test_allowed_action_executes(tg):
    result = execute(tg, "agent-research", "calculator", {"expression": "2**10"})
    assert result.status == "executed"
    assert result.output["result"] == 1024


def test_unknown_tool_is_blocked(tg):
    result = execute(tg, "agent-research", "rm_rf", {})
    assert result.status == "blocked"
    assert "Unknown tool" in result.decision.reason


def test_direct_invocation_without_a_ticket_is_refused(tg):
    with pytest.raises(ToolBypassError):
        tg.tools.protected("payment_transfer").invoke("forged", "req-1", "fp", {"account": "treasury", "amount": 1})


def test_tickets_are_single_use(tg):
    tickets = tg.tools.tickets
    ticket = tickets.issue("req-1", "calculator", "fp")
    tool = tg.tools.protected("calculator")
    assert tool.invoke(ticket, "req-1", "fp", {"expression": "1+1"})["result"] == 2
    with pytest.raises(ToolBypassError):
        tool.invoke(ticket, "req-1", "fp", {"expression": "1+1"})


def test_ticket_is_bound_to_tool_and_request(tg):
    ticket = tg.tools.tickets.issue("req-1", "calculator", "fp")
    with pytest.raises(ToolBypassError):
        tg.tools.protected("payment_transfer").invoke(ticket, "req-1", "fp", {"amount": 1})


def test_governance_failure_fails_closed(tg, monkeypatch):
    def broken(_request):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(tg.authorization, "evaluate", broken)
    result = tg.enforcer.execute("agent-research", "calculator", {"expression": "1+1"}, RequestContext())
    assert result.status == "blocked"
    assert "fail-closed" in result.decision.reason


def test_tool_errors_are_reported_not_raised(tg):
    result = execute(tg, "agent-research", "file_reader", {"path": "/research/notes.txt"})
    assert result.executed
    tg.tools.sandbox.files.pop("/research/notes.txt")
    failed = execute(tg, "agent-research", "file_reader", {"path": "/research/notes.txt"})
    assert failed.status == "failed"
    assert "No such file" in failed.error
