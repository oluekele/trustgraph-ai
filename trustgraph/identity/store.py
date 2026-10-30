"""Identity service: registration, credentials and lifecycle of principals."""

import secrets

from trustgraph.audit.logger import AuditLogger
from trustgraph.audit.models import AuditEventType
from trustgraph.common import sha256_hex
from trustgraph.errors import NotFoundError, ValidationError
from trustgraph.identity.models import Principal, PrincipalKind, PrincipalStatus
from trustgraph.persistence.repository import Repository


def hash_api_key(api_key: str) -> str:
    return sha256_hex(api_key)


class IdentityService:
    def __init__(self, repository: Repository, audit: AuditLogger):
        self.repository = repository
        self.audit = audit

    def register(self, principal: Principal, actor_id: str = "system") -> tuple[Principal, str | None]:
        """Register a principal. Agents receive an API key, returned only once."""
        if self.repository.get_principal(principal.id) is not None:
            raise ValidationError(f"Principal '{principal.id}' already exists.")
        for reference in (principal.owner_id, principal.parent_agent_id):
            if reference and self.repository.get_principal(reference) is None:
                raise ValidationError(f"Referenced principal '{reference}' does not exist.")
        for capability in principal.capabilities:
            if self.repository.get_capability(capability) is None:
                raise ValidationError(f"Unknown capability '{capability}'.")
        if principal.kind == PrincipalKind.AGENT and principal.owner_id is None:
            raise ValidationError("Every agent must have an accountable owner.")

        api_key = None
        key_hash = None
        if principal.kind == PrincipalKind.AGENT:
            api_key = f"tg_{principal.id}_{secrets.token_urlsafe(24)}"
            key_hash = hash_api_key(api_key)

        self.repository.add_principal(principal, api_key_hash=key_hash)
        self.audit.record(
            AuditEventType.PRINCIPAL_REGISTERED,
            actor_id=actor_id,
            details={"principal_id": principal.id, "kind": principal.kind.value},
        )
        return principal, api_key

    def get(self, principal_id: str) -> Principal | None:
        return self.repository.get_principal(principal_id)

    def require(self, principal_id: str) -> Principal:
        principal = self.repository.get_principal(principal_id)
        if principal is None:
            raise NotFoundError(f"Principal '{principal_id}' not found.")
        return principal

    def list(self, kind: PrincipalKind | None = None) -> list[Principal]:
        return self.repository.list_principals(kind)

    def set_status(self, principal_id: str, status: PrincipalStatus, actor_id: str = "system") -> Principal:
        principal = self.require(principal_id)
        self.repository.set_principal_status(principal_id, status)
        self.audit.record(
            AuditEventType.PRINCIPAL_STATUS,
            actor_id=actor_id,
            reason=f"{principal.status.value} -> {status.value}",
            details={"principal_id": principal_id, "status": status.value},
        )
        return self.require(principal_id)

    def rotate_api_key(self, principal_id: str) -> str:
        principal = self.require(principal_id)
        if principal.kind != PrincipalKind.AGENT:
            raise ValidationError("Only agents authenticate with API keys.")
        api_key = f"tg_{principal.id}_{secrets.token_urlsafe(24)}"
        self.repository.set_api_key_hash(principal_id, hash_api_key(api_key))
        return api_key

    def authenticate(self, api_key: str) -> Principal | None:
        """Resolve an agent API key to its principal.

        Keys are high-entropy random tokens stored only as SHA-256 hashes,
        so lookup by hash does not leak useful timing information.
        """
        principal_id = self.repository.principal_id_for_key_hash(hash_api_key(api_key))
        if principal_id is None:
            return None
        return self.repository.get_principal(principal_id)


# Name kept from the original prototype.
IdentityStore = IdentityService
