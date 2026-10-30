"""Administration of direct (root) authority grants."""

from datetime import datetime

from trustgraph.audit.logger import AuditLogger
from trustgraph.audit.models import AuditEventType
from trustgraph.capability.catalog import CatalogService, canonical_resource
from trustgraph.capability.models import Permission
from trustgraph.common import new_id, utc_now
from trustgraph.delegation.provenance import AuthorityGrant
from trustgraph.errors import NotFoundError, ValidationError
from trustgraph.persistence.repository import Repository


class DirectAuthorityService:
    def __init__(self, repository: Repository, catalog: CatalogService, audit: AuditLogger):
        self.repository = repository
        self.catalog = catalog
        self.audit = audit

    def grant(
        self,
        principal_id: str,
        permission: Permission,
        max_delegation_depth: int = 0,
        expires_at: datetime | None = None,
        granted_by: str = "system",
    ) -> AuthorityGrant:
        principal = self.repository.get_principal(principal_id)
        if principal is None:
            raise NotFoundError(f"Principal '{principal_id}' not found.")
        permission = Permission(
            capability=permission.capability,
            resource=canonical_resource(permission.resource),
            action=permission.action,
        )
        problems = self.catalog.validate_permission(permission)
        if problems:
            raise ValidationError(" ".join(problems))
        if principal.is_agent and not principal.has_capability(permission.capability):
            raise ValidationError(
                f"Agent '{principal_id}' lacks the technical capability "
                f"'{permission.capability}' required to exercise this grant."
            )
        if expires_at is not None and expires_at <= utc_now():
            raise ValidationError("Grant expiry must be in the future.")

        for existing in self.repository.list_grants(principal_id, include_revoked=False):
            if existing.permission == permission and existing.is_valid(utc_now()):
                raise ValidationError(f"Principal already holds a direct grant for {permission}.")

        grant = AuthorityGrant(
            id=new_id("grant"),
            principal_id=principal_id,
            capability=permission.capability,
            resource=permission.resource,
            action=permission.action,
            max_delegation_depth=max_delegation_depth,
            granted_by=granted_by,
            expires_at=expires_at,
        )
        self.repository.add_grant(grant)
        self.audit.record(
            AuditEventType.GRANT_CREATED,
            actor_id=granted_by,
            capability=permission.capability,
            resource=permission.resource,
            action=permission.action,
            details={"grant_id": grant.id, "principal_id": principal_id},
        )
        return grant

    def revoke(self, grant_id: str, revoked_by: str = "system") -> AuthorityGrant:
        grant = self.repository.get_grant(grant_id)
        if grant is None:
            raise NotFoundError(f"Grant '{grant_id}' not found.")
        if grant.revoked_at is not None:
            raise ValidationError(f"Grant '{grant_id}' is already revoked.")
        self.repository.revoke_grant(grant_id, utc_now())
        self.audit.record(
            AuditEventType.GRANT_REVOKED,
            actor_id=revoked_by,
            capability=grant.capability,
            resource=grant.resource,
            action=grant.action,
            details={"grant_id": grant_id, "principal_id": grant.principal_id},
        )
        return self.repository.get_grant(grant_id)

    def list(self, principal_id: str | None = None) -> list[AuthorityGrant]:
        return self.repository.list_grants(principal_id)


# Name kept from the original prototype.
DirectAuthorityStore = DirectAuthorityService
