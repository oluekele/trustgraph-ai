from trustgraph.risk.action_sensitivity import ActionSensitivityAnalyzer


def test_actions_are_ordered_by_consequence():
    analyzer = ActionSensitivityAnalyzer()
    ordered = ["list", "read", "execute", "write", "send", "delete", "transfer"]
    scores = [analyzer.assess(action) for action in ordered]
    assert scores == sorted(scores)


def test_unknown_and_missing_actions_are_treated_as_sensitive():
    analyzer = ActionSensitivityAnalyzer()
    assert analyzer.assess("frobnicate") == ActionSensitivityAnalyzer.UNKNOWN_ACTION
    assert analyzer.assess(None) == 100.0


def test_action_lookup_is_case_insensitive():
    assert ActionSensitivityAnalyzer().assess("DELETE") == 90.0


def test_side_effect_classification():
    analyzer = ActionSensitivityAnalyzer()
    assert analyzer.is_side_effecting("send")
    assert not analyzer.is_side_effecting("read")
