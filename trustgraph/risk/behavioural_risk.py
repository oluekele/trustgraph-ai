from datetime import timedelta

from trustgraph.common import utc_now
from trustgraph.persistence.repository import Repository


class BehaviouralRiskAnalyzer:
    """Risk from the agent's recent behaviour, read from the audit log.

    * each denied request in the window: +20 (probing for authority)
    * request rate above ``burst_threshold`` in the window: +2 per excess
      request (runaway loops / excessive agency)
    """

    DENIAL_WEIGHT = 20.0
    BURST_WEIGHT = 2.0

    def __init__(self, repository: Repository, window_minutes: int = 10, burst_threshold: int = 30):
        self.repository = repository
        self.window = timedelta(minutes=window_minutes)
        self.burst_threshold = burst_threshold

    def assess(self, agent_id: str) -> tuple[float, list[str]]:
        total, denials = self.repository.recent_activity(agent_id, utc_now() - self.window)
        score = denials * self.DENIAL_WEIGHT
        score += max(0, total - self.burst_threshold) * self.BURST_WEIGHT
        notes = []
        if denials:
            notes.append(f"{denials} denied request(s) in the last {int(self.window.total_seconds() // 60)} min")
        if total > self.burst_threshold:
            notes.append(f"request burst: {total} requests in window")
        return min(100.0, score), notes
