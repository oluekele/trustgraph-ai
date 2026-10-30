"""Resource canonicalisation prevents path tricks from bypassing exact-tuple checks."""

import pytest

from tests.conftest import authorize, execute
from trustgraph.authorization.models import Decision
from trustgraph.capability.catalog import canonical_resource
from trustgraph.errors import ValidationError


@pytest.mark.parametrize(
    ("raw", "canonical"),
    [
        ("file:///research/../hr/salaries.csv", "file:///hr/salaries.csv"),
        ("file:///research/./report.pdf", "file:///research/report.pdf"),
        ("file:////research//report.pdf", "file:///research/report.pdf"),
        ("DB://CRM/customers/", "db://crm/customers"),
        ("api://Status.Acme.Example", "api://status.acme.example"),
    ],
)
def test_canonical_resource(raw, canonical):
    assert canonical_resource(raw) == canonical


@pytest.mark.parametrize("raw", ["", "no-scheme", "file:///a\x00b"])
def test_invalid_resource_identifiers_are_rejected(raw):
    with pytest.raises(ValidationError):
        canonical_resource(raw)


def test_path_traversal_is_evaluated_against_the_real_target(tg):
    decision = authorize(tg, "agent-research", "file.read", "file:///research/../hr/salaries.csv", "read")
    assert decision.decision == Decision.DENY
    assert decision.resource == "file:///hr/salaries.csv"
    assert any("canonicalised" in step.detail for step in decision.trace)


def test_tool_level_path_traversal_never_reads_the_file(tg):
    result = execute(tg, "agent-research", "file_reader", {"path": "/research/../hr/salaries.csv"})
    assert result.status == "blocked"
    assert result.output is None
