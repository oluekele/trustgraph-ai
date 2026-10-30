from pydantic import BaseModel, Field

from trustgraph.capability.models import Permission
from trustgraph.delegation.provenance import AuthorityPath


class EffectiveAuthority(BaseModel):
    """Everything a principal may currently do, with provenance for each grant.

    Effective authority is reconstructed on demand from direct grants and
    *currently valid* delegation chains, so revocation, expiry and
    suspension anywhere upstream take effect immediately.
    """

    principal_id: str
    paths: list[AuthorityPath] = Field(default_factory=list)

    def permissions(self) -> set[Permission]:
        return {path.permission for path in self.paths}

    def has_exact_grant(self, capability: str, resource: str, action: str) -> bool:
        return self.has(Permission(capability=capability, resource=resource, action=action))

    def has(self, permission: Permission) -> bool:
        return any(path.permission == permission for path in self.paths)

    def paths_for(self, permission: Permission) -> list[AuthorityPath]:
        return [path for path in self.paths if path.permission == permission]

    def best_path(self, permission: Permission) -> AuthorityPath | None:
        """Prefer the shortest chain, then the one with most delegation headroom."""
        candidates = self.paths_for(permission)
        if not candidates:
            return None
        return min(candidates, key=lambda path: (path.hops, -path.remaining_depth))

    def best_delegable_path(self, permission: Permission) -> AuthorityPath | None:
        candidates = [path for path in self.paths_for(permission) if path.delegable]
        if not candidates:
            return None
        return max(candidates, key=lambda path: (path.remaining_depth, -path.hops))
