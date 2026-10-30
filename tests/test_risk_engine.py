"""Weighted risk model with interaction term and configurable bands."""

import pytest

from trustgraph.risk.engine import RiskEngine
from trustgraph.risk.models import RiskConfig, RiskFactors, RiskLevel, RiskThresholds


def factors(action=0.0, resource=0.0, delegation=0.0, context=0.0, behaviour=0.0):
    return RiskFactors(action_sensitivity=action, resource_sensitivity=resource, delegation_risk=delegation,
                       context_risk=context, behavioural_risk=behaviour)


def test_zero_factors_are_low_risk():
    assessment = RiskEngine().assess(factors())
    assert assessment.score == 0 and assessment.level == RiskLevel.LOW


def test_score_is_weighted_sum_plus_interaction():
    assessment = RiskEngine().assess(factors(action=90, resource=70, delegation=30))
    # 0.3*90 + 0.3*70 + 0.15*30 + 0.25*(90*70/100)
    assert assessment.score == pytest.approx(27 + 21 + 4.5 + 15.75)
    assert sum(assessment.contributions.values()) == pytest.approx(assessment.score)


def test_score_is_clamped():
    assert RiskEngine().assess(factors(100, 100, 100, 100, 100)).score == 100


@pytest.mark.parametrize(
    ("score_inputs", "level"),
    [((0, 0), RiskLevel.LOW), ((60, 60), RiskLevel.MEDIUM), ((90, 70), RiskLevel.HIGH), ((100, 100), RiskLevel.CRITICAL)],
)
def test_default_bands(score_inputs, level):
    action, resource = score_inputs
    assert RiskEngine().assess(factors(action, resource)).level == level


def test_thresholds_are_configurable():
    lenient = RiskEngine(RiskConfig(thresholds=RiskThresholds(medium=80, high=90, critical=95)))
    assert lenient.assess(factors(90, 70)).level == RiskLevel.LOW


def test_factors_are_bounded():
    with pytest.raises(ValueError):
        factors(action=101)
