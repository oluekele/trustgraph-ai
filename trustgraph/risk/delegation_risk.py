from trustgraph.delegation.provenance import AuthorityPath


class DelegationRiskAnalyzer:
    """Risk from how far the authority travelled from its accountable root.

    Each hop adds an intermediary whose reasoning could have been
    compromised, so longer chains carry more risk.
    """

    HOP_RISK = {0: 0.0, 1: 30.0, 2: 55.0, 3: 75.0}
    MAX_HOP_RISK = 90.0

    def assess(self, path: AuthorityPath | None) -> float:
        if path is None:
            return 100.0
        return self.HOP_RISK.get(path.hops, self.MAX_HOP_RISK)
