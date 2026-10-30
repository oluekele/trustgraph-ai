class ActionSensitivityAnalyzer:
    """Inherent sensitivity of an action verb (0-100).

    Values are experimental parameters of the prototype (docs/risk-model.md),
    ordered by reversibility and blast radius: observing < computing <
    creating/changing < communicating externally < destroying < moving money.
    """

    ACTION_SENSITIVITY: dict[str, float] = {
        "list": 10.0,
        "read": 15.0,
        "search": 15.0,
        "execute": 30.0,
        "create": 45.0,
        "write": 55.0,
        "update": 60.0,
        "send": 65.0,
        "deploy": 80.0,
        "delete": 90.0,
        "transfer": 100.0,
        "admin": 100.0,
    }

    UNKNOWN_ACTION = 75.0

    # Actions with side effects beyond the agent's own context.
    SIDE_EFFECTING = frozenset({"create", "write", "update", "send", "deploy", "delete", "transfer", "admin"})

    def assess(self, action: str | None) -> float:
        if not action:
            return 100.0
        return self.ACTION_SENSITIVITY.get(action.lower(), self.UNKNOWN_ACTION)

    def is_side_effecting(self, action: str | None) -> bool:
        return bool(action) and action.lower() in self.SIDE_EFFECTING
