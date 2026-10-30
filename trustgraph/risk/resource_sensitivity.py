from trustgraph.capability.models import Classification, Resource


class ResourceSensitivityAnalyzer:
    """Sensitivity of the target resource (0-100).

    The registered resource's own sensitivity is authoritative; it is never
    taken from the client request. Unregistered resources score maximal.
    """

    CLASSIFICATION_FLOOR: dict[Classification, float] = {
        Classification.PUBLIC: 0.0,
        Classification.INTERNAL: 25.0,
        Classification.CONFIDENTIAL: 55.0,
        Classification.RESTRICTED: 80.0,
    }

    def assess(self, resource: Resource | None) -> float:
        if resource is None:
            return 100.0
        floor = self.CLASSIFICATION_FLOOR.get(resource.classification, 50.0)
        return max(resource.sensitivity, floor)
