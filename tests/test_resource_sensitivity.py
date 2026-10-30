from trustgraph.capability.models import Classification, Resource
from trustgraph.risk.resource_sensitivity import ResourceSensitivityAnalyzer


def resource(classification, sensitivity):
    return Resource(id="x://r", name="r", kind="k", classification=classification, sensitivity=sensitivity,
                    allowed_actions=["read"])


def test_registered_sensitivity_is_used():
    assert ResourceSensitivityAnalyzer().assess(resource(Classification.CONFIDENTIAL, 70)) == 70


def test_classification_sets_a_floor():
    # A restricted resource mislabelled with low sensitivity still scores high.
    assert ResourceSensitivityAnalyzer().assess(resource(Classification.RESTRICTED, 10)) == 80


def test_unregistered_resource_is_maximally_sensitive():
    assert ResourceSensitivityAnalyzer().assess(None) == 100


def test_clients_cannot_supply_resource_sensitivity(tg):
    from tests.conftest import authorize

    decision = authorize(tg, "agent-research", "file.read", "file:///research/report.pdf", "read")
    assert decision.risk.factors.resource_sensitivity == 30
