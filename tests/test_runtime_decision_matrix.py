"""End-to-end decision matrix over representative requests in the seed world."""

import pytest

from tests.conftest import execute

MATRIX = [
    ("agent-research", "calculator", {"expression": "6*7"}, "Routine task", "allow"),
    ("agent-research", "web_search", {"query": "zero trust"}, "Research", "allow"),
    ("agent-orchestrator", "crm_query", {"table": "customers"}, "Month end", "allow"),
    ("agent-reporting", "crm_query", {"table": "customers"}, "Weekly report", "restrict"),
    ("agent-support", "crm_delete", {"record_ids": ["C-1004"]}, "Erasure request", "require_approval"),
    ("agent-finance", "payment_transfer", {"account": "vendor-payouts", "recipient": "NW", "amount": 10.0},
     "Invoice", "require_approval"),
    ("agent-finance", "payment_transfer", {"account": "treasury", "recipient": "NW", "amount": 10.0},
     "Invoice", "deny"),
    ("agent-intern", "crm_query", {"table": "customers"}, "Curious", "deny"),
    ("agent-legacy", "file_reader", {"path": "/research/notes.txt"}, "Batch", "deny"),
    ("agent-research", "file_reader", {"path": "/hr/salaries.csv"}, "Research", "deny"),
]


@pytest.mark.parametrize(("agent", "tool", "arguments", "purpose", "expected"), MATRIX)
def test_decision_matrix(tg, agent, tool, arguments, purpose, expected):
    assert execute(tg, agent, tool, arguments, purpose=purpose).decision.decision == expected
