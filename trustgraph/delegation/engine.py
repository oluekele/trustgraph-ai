"""Delegation validation rules.

The central rule: *an agent must not delegate authority greater than its
own effective authority.* Concretely, every delegated permission must
match, exactly, a permission the delegator currently holds through a path
that still permits further delegation.
"""

from dataclasses import dataclass, field
from datetime import datetime

from trustgraph.capability.catalog import CatalogService
from trustgraph.capability.models import Permission
from trustgraph.common import ensure_utc, min_datetime
from trustgraph.delegation.authority import EffectiveAuthority
from trustgraph.delegation.models import DelegationRequest
from trustgraph.delegation.provenance import AuthorityPath
from trustgraph.identity.models import Principal


@dataclass
class DelegationValidation:
    violations: list[str] = field(default_factory=list)
    backing_paths: dict[Permission, AuthorityPath] = field(default_factory=dict)
    effective_expiry: datetime | None = None

    @property
    def valid(self) -> bool:
        return not self.violations


class DelegationValidator:
    def __init__(self, catalog: CatalogService):
        self.catalog = catalog

    def validate(
        self,
        request: DelegationRequest,
        delegator: Principal | None,
        delegatee: Principal | None,
        delegator_authority: EffectiveAuthority,
        now: datetime,
    ) -> DelegationValidation:
        result = DelegationValidation()
        violations = result.violations

        # Identity --------------------------------------------------------
        if delegator is None:
            violations.append(f"Delegator '{request.delegator_id}' is not a registered principal.")
        elif not delegator.is_active:
            violations.append(f"Delegator '{delegator.id}' is {delegator.status.value}.")
        if delegatee is None:
            violations.append(f"Delegatee '{request.delegatee_id}' is not a registered principal.")
        else:
            if not delegatee.is_agent:
                violations.append("Authority can only be delegated to AI agents.")
            if not delegatee.is_active:
                violations.append(f"Delegatee '{delegatee.id}' is {delegatee.status.value}.")
        if request.delegator_id == request.delegatee_id:
            violations.append("A principal cannot delegate to itself.")
        if violations:
            return result

        # Expiry ------------------------------------------------------------
        requested_expiry = ensure_utc(request.expires_at)
        if requested_expiry is not None and requested_expiry <= now:
            violations.append("Delegation expiry must be in the future.")

        # Grants ------------------------------------------------------------
        if len(set(request.grants)) != len(request.grants):
            violations.append("Delegation contains duplicate authority grants.")

        for permission in request.grants:
            problems = self.catalog.validate_permission(permission)
            if problems:
                violations.extend(problems)
                continue

            if not delegatee.has_capability(permission.capability):
                violations.append(
                    f"Delegatee '{delegatee.id}' lacks the technical capability "
                    f"'{permission.capability}' for {permission}."
                )

            held = delegator_authority.paths_for(permission)
            if not held:
                violations.append(
                    f"Privilege amplification blocked: delegator '{delegator.id}' does not "
                    f"hold the exact authority {permission}."
                )
                continue

            delegable = [path for path in held if path.delegable]
            if not delegable:
                violations.append(
                    f"Delegator '{delegator.id}' holds {permission} but is not permitted to "
                    "delegate it further (delegation depth exhausted)."
                )
                continue

            acyclic = [path for path in delegable if delegatee.id not in path.principals]
            if not acyclic:
                violations.append(
                    f"Circular delegation blocked: '{delegatee.id}' is already upstream of "
                    f"'{delegator.id}' for {permission}."
                )
                continue

            # The delegatee's onward depth is min(path depth - 1, requested), so a
            # larger request can never amplify depth; it is simply capped.
            path = max(acyclic, key=lambda candidate: (candidate.remaining_depth, -candidate.hops))

            upstream_expiry = ensure_utc(path.expires_at)
            if (
                requested_expiry is not None
                and upstream_expiry is not None
                and requested_expiry > upstream_expiry
            ):
                violations.append(
                    f"Delegation of {permission} would outlive the delegator's authority "
                    f"(expires {upstream_expiry.isoformat()})."
                )
                continue

            result.backing_paths[permission] = path

        if not violations:
            result.effective_expiry = min_datetime(
                requested_expiry,
                *(path.expires_at for path in result.backing_paths.values()),
            )
        return result
