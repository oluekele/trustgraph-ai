from trustgraph.authorization.models import AuthorizationRequest
from trustgraph.capability.models import Resource
from trustgraph.delegation.provenance import AuthorityPath
from trustgraph.persistence.repository import Repository
from trustgraph.risk.action_sensitivity import ActionSensitivityAnalyzer
from trustgraph.risk.behavioural_risk import BehaviouralRiskAnalyzer
from trustgraph.risk.context_risk import ContextRiskAnalyzer
from trustgraph.risk.delegation_risk import DelegationRiskAnalyzer
from trustgraph.risk.models import RiskFactors
from trustgraph.risk.resource_sensitivity import ResourceSensitivityAnalyzer


class RuntimeRiskFactorsBuilder:
    """Derives every risk factor server-side; clients cannot supply them."""

    def __init__(self, repository: Repository, behaviour_window_minutes: int = 10):
        self.action = ActionSensitivityAnalyzer()
        self.resource = ResourceSensitivityAnalyzer()
        self.delegation = DelegationRiskAnalyzer()
        self.context = ContextRiskAnalyzer()
        self.behavioural = BehaviouralRiskAnalyzer(repository, behaviour_window_minutes)

    def build(
        self,
        request: AuthorizationRequest,
        resource: Resource | None,
        path: AuthorityPath | None,
    ) -> tuple[RiskFactors, list[str]]:
        side_effecting = self.action.is_side_effecting(request.action)
        context_score, context_notes = self.context.assess(
            request.context, request.arguments, side_effecting
        )
        behaviour_score, behaviour_notes = self.behavioural.assess(request.agent_id)
        factors = RiskFactors(
            action_sensitivity=self.action.assess(request.action),
            resource_sensitivity=self.resource.assess(resource),
            delegation_risk=self.delegation.assess(path),
            context_risk=context_score,
            behavioural_risk=behaviour_score,
        )
        return factors, context_notes + behaviour_notes
