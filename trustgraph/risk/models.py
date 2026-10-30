from enum import StrEnum

from pydantic import BaseModel, Field


class RiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RiskFactors(BaseModel):
    """Normalised risk factors, each on a 0-100 scale."""

    action_sensitivity: float = Field(ge=0, le=100)
    resource_sensitivity: float = Field(ge=0, le=100)
    delegation_risk: float = Field(ge=0, le=100)
    context_risk: float = Field(ge=0, le=100)
    behavioural_risk: float = Field(ge=0, le=100)


class RiskWeights(BaseModel):
    action_sensitivity: float = 0.30
    resource_sensitivity: float = 0.30
    delegation_risk: float = 0.15
    context_risk: float = 0.15
    behavioural_risk: float = 0.10
    # Interaction term: sensitive actions on sensitive resources compound.
    sensitivity_interaction: float = 0.25


class RiskThresholds(BaseModel):
    """Lower bounds (inclusive) of the MEDIUM, HIGH and CRITICAL bands."""

    medium: float = 35.0
    high: float = 60.0
    critical: float = 80.0


class RiskConfig(BaseModel):
    """Experimental parameters of the risk model (see docs/risk-model.md)."""

    weights: RiskWeights = Field(default_factory=RiskWeights)
    thresholds: RiskThresholds = Field(default_factory=RiskThresholds)
    behaviour_window_minutes: int = 10


class RiskAssessment(BaseModel):
    score: float
    level: RiskLevel
    factors: RiskFactors
    contributions: dict[str, float] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)
