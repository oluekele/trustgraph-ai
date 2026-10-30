"""Delegation lifecycle: creation, multi-hop chains and cascading revocation."""

from trustgraph.audit.logger import AuditLogger
from trustgraph.audit.models import AuditEventType
from trustgraph.capability.catalog import CatalogService, canonical_resource
from trustgraph.capability.models import Permission
from trustgraph.common import new_id, utc_now
from trustgraph.delegation.authority import EffectiveAuthority
from trustgraph.delegation.engine import DelegationValidator
from trustgraph.delegation.models import (
    Delegation,
    DelegationRequest,
    DelegationResult,
    DelegationStatus,
)
from trustgraph.delegation.reconstructor import EffectiveAuthorityReconstructor
from trustgraph.errors import NotFoundError, ValidationError
from trustgraph.persistence.repository import Repository


class DelegationChainEngine:
    def __init__(
        self,
        repository: Repository,
        catalog: CatalogService,
        reconstructor: EffectiveAuthorityReconstructor,
        audit: AuditLogger,
    ):
        self.repository = repository
        self.catalog = catalog
        self.reconstructor = reconstructor
        self.audit = audit
        self.validator = DelegationValidator(catalog)

    def get_effective_authority(self, principal_id: str) -> EffectiveAuthority:
        return self.reconstructor.reconstruct(principal_id)

    def create_delegation(self, request: DelegationRequest, created_by: str | None = None) -> DelegationResult:
        created_by = created_by or request.delegator_id
        request = request.model_copy(
            update={
                "grants": [
                    Permission(
                        capability=grant.capability,
                        resource=canonical_resource(grant.resource),
                        action=grant.action,
                    )
                    for grant in request.grants
                ]
            }
        )
        now = utc_now()
        delegator = self.repository.get_principal(request.delegator_id)
        delegatee = self.repository.get_principal(request.delegatee_id)
        authority = self.reconstructor.reconstruct(request.delegator_id, now)
        validation = self.validator.validate(request, delegator, delegatee, authority, now)

        if not validation.valid:
            reason = validation.violations[0]
            self.audit.record(
                AuditEventType.DELEGATION_REJECTED,
                actor_id=request.delegator_id,
                decision="deny",
                reason=reason,
                details={
                    "delegatee_id": request.delegatee_id,
                    "grants": [grant.model_dump() for grant in request.grants],
                    "violations": validation.violations,
                    "created_by": created_by,
                },
            )
            return DelegationResult(accepted=False, reason=reason, violations=validation.violations)

        backing = list(validation.backing_paths.values())
        parents = {path.chain[-1] for path in backing if path.chain}
        roots = {path.root_principal_id for path in backing}
        delegation = Delegation(
            id=new_id("dlg"),
            delegator_id=request.delegator_id,
            delegatee_id=request.delegatee_id,
            grants=request.grants,
            purpose=request.purpose,
            max_redelegation_depth=request.max_redelegation_depth,
            parent_delegation_id=parents.pop() if len(parents) == 1 else None,
            depth=max(path.hops for path in backing) + 1,
            created_by=created_by,
            created_at=now,
            expires_at=validation.effective_expiry,
        )
        self.repository.add_delegation(delegation)
        sample = backing[0]
        self.audit.record(
            AuditEventType.DELEGATION_CREATED,
            actor_id=request.delegator_id,
            on_behalf_of=sample.root_principal_id if len(roots) == 1 else None,
            delegation_chain=[*sample.chain, delegation.id],
            principal_chain=[*sample.principals, request.delegatee_id],
            purpose=request.purpose,
            decision="allow",
            reason="Delegation is within the delegator's effective authority.",
            details={
                "delegation_id": delegation.id,
                "delegatee_id": request.delegatee_id,
                "grants": [grant.model_dump() for grant in request.grants],
                "depth": delegation.depth,
                "created_by": created_by,
            },
        )
        return DelegationResult(
            accepted=True,
            reason="Delegation created.",
            delegation=delegation,
        )

    def revoke_delegation(
        self, delegation_id: str, revoked_by: str = "system", reason: str = "Revoked by operator."
    ) -> list[Delegation]:
        """Revoke a delegation and every downstream delegation it backed.

        Effective authority is recomputed per request, so downstream agents
        lose authority immediately regardless. Downstream delegations that
        no longer have any backing are additionally marked revoked so the
        delegation register reflects reality.
        """
        target = self.repository.get_delegation(delegation_id)
        if target is None:
            raise NotFoundError(f"Delegation '{delegation_id}' not found.")
        if target.status != DelegationStatus.ACTIVE:
            raise ValidationError(f"Delegation '{delegation_id}' is already {target.status.value}.")

        revoked = [self._mark_revoked(target, revoked_by, reason)]
        revoked.extend(self.cascade(revoked_by, f"Cascade from revocation of {delegation_id}."))
        return revoked

    def cascade(self, actor_id: str, reason: str) -> list[Delegation]:
        """Mark active delegations whose grants are no longer backed as revoked."""
        revoked: list[Delegation] = []
        changed = True
        while changed:
            changed = False
            now = utc_now()
            for delegation in self.repository.list_delegations(status=DelegationStatus.ACTIVE):
                authority = self.reconstructor.reconstruct(delegation.delegator_id, now)
                backed = any(
                    any(
                        path.delegable and delegation.delegatee_id not in path.principals
                        for path in authority.paths_for(permission)
                    )
                    for permission in delegation.grants
                )
                if not backed:
                    revoked.append(self._mark_revoked(delegation, actor_id, reason))
                    changed = True
        return revoked

    def _mark_revoked(self, delegation: Delegation, actor_id: str, reason: str) -> Delegation:
        updated = delegation.model_copy(
            update={
                "status": DelegationStatus.REVOKED,
                "revoked_at": utc_now(),
                "revoked_reason": reason,
            }
        )
        self.repository.update_delegation(updated)
        self.audit.record(
            AuditEventType.DELEGATION_REVOKED,
            actor_id=actor_id,
            reason=reason,
            details={
                "delegation_id": delegation.id,
                "delegator_id": delegation.delegator_id,
                "delegatee_id": delegation.delegatee_id,
            },
        )
        return updated

    def get(self, delegation_id: str) -> Delegation:
        delegation = self.repository.get_delegation(delegation_id)
        if delegation is None:
            raise NotFoundError(f"Delegation '{delegation_id}' not found.")
        return delegation

    def list(
        self, principal_id: str | None = None, status: DelegationStatus | None = None
    ) -> list[Delegation]:
        return self.repository.list_delegations(principal_id, status)
