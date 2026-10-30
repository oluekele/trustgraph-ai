import re
from typing import Any

from trustgraph.authorization.models import RequestContext

# Phrases typical of instructions smuggled into data the agent reads.
INJECTION_PATTERNS = re.compile(
    r"ignore (all |any )?(previous|prior|above) instructions"
    r"|disregard (the |your )?(previous|prior|system)"
    r"|you are now"
    r"|system prompt"
    r"|override (the )?(policy|governance|security)"
    r"|bypass (the )?(policy|governance|approval|security)",
    re.IGNORECASE,
)


def contains_injection_marker(value: Any) -> bool:
    if isinstance(value, str):
        return bool(INJECTION_PATTERNS.search(value))
    if isinstance(value, dict):
        return any(contains_injection_marker(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(contains_injection_marker(item) for item in value)
    return False


class ContextRiskAnalyzer:
    """Risk from the circumstances of the request (0-100).

    * no stated purpose: +25
    * the agent has ingested untrusted content this session: +20, or +60
      when the requested action has side effects (the precondition for
      indirect prompt injection turning into harmful action)
    * injection-like phrases in the action arguments: +30
    """

    def assess(
        self,
        context: RequestContext,
        arguments: dict[str, Any],
        side_effecting: bool,
    ) -> tuple[float, list[str]]:
        score = 0.0
        notes: list[str] = []
        if not (context.purpose or "").strip():
            score += 25.0
            notes.append("no stated purpose")
        if context.untrusted_input:
            if side_effecting:
                score += 60.0
                notes.append("side-effecting action after ingesting untrusted content")
            else:
                score += 20.0
                notes.append("agent has ingested untrusted content")
        if contains_injection_marker(arguments):
            score += 30.0
            notes.append("injection-like instructions in arguments")
        return min(100.0, score), notes
