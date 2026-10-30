"""Superseded by tests/test_action_sensitivity.py; kept as a minimal smoke check."""

from trustgraph.risk.action_sensitivity import ActionSensitivityAnalyzer


def test_read_is_less_sensitive_than_delete():
    analyzer = ActionSensitivityAnalyzer()
    assert analyzer.assess("read") < analyzer.assess("delete")
