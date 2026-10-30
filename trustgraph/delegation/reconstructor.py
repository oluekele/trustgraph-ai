"""Effective-authority reconstruction.

Authority is never cached on the delegatee. Every evaluation walks back
from the requesting agent through currently-valid delegations to a root
direct grant. A delegated permission is only valid if, at that moment:

* every principal on the path is ACTIVE;
* every delegation on the path is ACTIVE and unexpired;
* the root direct grant is unrevoked and unexpired;
* each delegator held the *exact* permission through a path that still
  had delegation depth remaining when it delegated (non-amplification);
* no principal appears twice on the path (no cycles).

Because validity is recomputed, revoking or expiring any upstream link
immediately removes authority from every downstream agent (cascading
revocation without stale state).
"""

from datetime import datetime

from trustgraph.common import min_datetime, utc_now
from trustgraph.delegation.authority import EffectiveAuthority
from trustgraph.delegation.provenance import AuthorityPath
from trustgraph.persistence.repository import Repository

MAX_CHAIN_LENGTH = 10


class _Snapshot:
    """Per-reconstruction memo so each principal's rows are read at most once."""

    def __init__(self, repository: Repository):
        self.repository = repository
        self._principals: dict = {}
        self._grants: dict = {}
        self._delegations: dict = {}

    def principal(self, principal_id: str):
        if principal_id not in self._principals:
            self._principals[principal_id] = self.repository.get_principal(principal_id)
        return self._principals[principal_id]

    def grants(self, principal_id: str):
        if principal_id not in self._grants:
            self._grants[principal_id] = self.repository.list_grants(principal_id, include_revoked=False)
        return self._grants[principal_id]

    def delegations_to(self, principal_id: str):
        if principal_id not in self._delegations:
            self._delegations[principal_id] = self.repository.delegations_to(principal_id)
        return self._delegations[principal_id]


class EffectiveAuthorityReconstructor:
    def __init__(self, repository: Repository):
        self.repository = repository

    def reconstruct(self, principal_id: str, now: datetime | None = None) -> EffectiveAuthority:
        now = now or utc_now()
        snapshot = _Snapshot(self.repository)
        paths = self._paths(principal_id, now, frozenset(), snapshot)
        return EffectiveAuthority(principal_id=principal_id, paths=paths)

    def _paths(
        self,
        principal_id: str,
        now: datetime,
        visiting: frozenset[str],
        snapshot: _Snapshot,
    ) -> list[AuthorityPath]:
        if len(visiting) >= MAX_CHAIN_LENGTH:
            return []

        principal = snapshot.principal(principal_id)
        if principal is None or not principal.is_active:
            return []

        paths: list[AuthorityPath] = []

        for grant in snapshot.grants(principal_id):
            if not grant.is_valid(now):
                continue
            paths.append(
                AuthorityPath(
                    permission=grant.permission,
                    root_principal_id=principal_id,
                    root_grant_id=grant.id,
                    chain=[],
                    principals=[principal_id],
                    remaining_depth=grant.max_delegation_depth,
                    expires_at=grant.expires_at,
                )
            )

        for delegation in snapshot.delegations_to(principal_id):
            if not delegation.is_valid(now):
                continue
            delegator = delegation.delegator_id
            if delegator == principal_id or delegator in visiting:
                continue
            upstream = self._paths(delegator, now, visiting | {principal_id}, snapshot)
            for permission in delegation.grants:
                for source in upstream:
                    if source.permission != permission:
                        continue
                    if not source.delegable:
                        continue
                    if principal_id in source.principals:
                        continue
                    paths.append(
                        AuthorityPath(
                            permission=permission,
                            root_principal_id=source.root_principal_id,
                            root_grant_id=source.root_grant_id,
                            chain=[*source.chain, delegation.id],
                            principals=[*source.principals, principal_id],
                            remaining_depth=min(
                                source.remaining_depth - 1,
                                delegation.max_redelegation_depth,
                            ),
                            expires_at=min_datetime(source.expires_at, delegation.expires_at),
                        )
                    )

        return paths
