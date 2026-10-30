from trustgraph.risk.models import (
    RiskAssessment,
    RiskConfig,
    RiskFactors,
    RiskLevel,
)


class RiskEngine:
    """Combine normalised factors into a score and a risk band.

    score = Σ wᵢ·fᵢ + w_int · (action_sensitivity · resource_sensitivity / 100)

    The interaction term captures that a destructive action on a highly
    sensitive resource is riskier than the two factors averaged. Weights and
    thresholds are experimental parameters (``RiskConfig``), evaluated by the
    sensitivity analysis in ``evaluation/``.
    """

    def __init__(self, config: RiskConfig | None = None):
        self.config = config or RiskConfig()

    def assess(self, factors: RiskFactors, notes: list[str] | None = None) -> RiskAssessment:
        weights = self.config.weights
        contributions = {
            "action_sensitivity": factors.action_sensitivity * weights.action_sensitivity,
            "resource_sensitivity": factors.resource_sensitivity * weights.resource_sensitivity,
            "delegation_risk": factors.delegation_risk * weights.delegation_risk,
            "context_risk": factors.context_risk * weights.context_risk,
            "behavioural_risk": factors.behavioural_risk * weights.behavioural_risk,
            "sensitivity_interaction": (
                factors.action_sensitivity * factors.resource_sensitivity / 100.0
            )
            * weights.sensitivity_interaction,
        }
        score = round(max(0.0, min(100.0, sum(contributions.values()))), 2)
        return RiskAssessment(
            score=score,
            level=self.level_for(score),
            factors=factors,
            contributions={key: round(value, 2) for key, value in contributions.items()},
            notes=notes or [],
        )

    def level_for(self, score: float) -> RiskLevel:
        thresholds = self.config.thresholds
        if score >= thresholds.critical:
            return RiskLevel.CRITICAL
        if score >= thresholds.high:
            return RiskLevel.HIGH
        if score >= thresholds.medium:
            return RiskLevel.MEDIUM
        return RiskLevel.LOW
