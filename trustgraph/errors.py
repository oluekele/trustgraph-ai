class TrustGraphError(Exception):
    """Base error for governance operations."""


class NotFoundError(TrustGraphError):
    pass


class ValidationError(TrustGraphError):
    pass


class ConflictError(TrustGraphError):
    pass
