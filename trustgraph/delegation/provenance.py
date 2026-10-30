"""Provenance of authority: direct grants and the paths authority travels."""

from datetime import datetime

from pydantic import BaseModel, Field

from trustgraph.capability.models import Permission
from trustgraph.common import ensure_utc, utc_now


class AuthorityGrant(BaseModel):
    """Direct (root) authority assigned to a principal by an administrator.

    ``max_delegation_depth`` bounds how many delegation hops this authority
    may travel. ``0`` means the holder may use but never delegate it.
    """

    id: str
    principal_id: str
    capability: str
    resource: str
    action: str
    max_delegation_depth: int = Field(default=0, ge=0, le=10)
    granted_by: str = "system"
    created_at: datetime = Field(default_factory=utc_now)
    expires_at: datetime | None = None
    revoked_at: datetime | None = None

    @property
    def permission(self) -> Permission:
        return Permission(capability=self.capability, resource=self.resource, action=self.action)

    def is_valid(self, now: datetime) -> bool:
        if self.revoked_at is not None:
            return False
        expires = ensure_utc(self.expires_at)
        return expires is None or expires > now


class AuthorityPath(BaseModel):
    """One verified route by which a principal holds a permission.

    ``principals`` lists every principal from the root grant holder to the
    current holder; ``chain`` lists the delegation ids traversed.
    """

    permission: Permission
    root_principal_id: str
    root_grant_id: str
    chain: list[str] = Field(default_factory=list)
    principals: list[str] = Field(default_factory=list)
    remaining_depth: int = 0
    expires_at: datetime | None = None

    @property
    def hops(self) -> int:
        return len(self.chain)

    @property
    def is_direct(self) -> bool:
        return not self.chain

    @property
    def delegable(self) -> bool:
        return self.remaining_depth >= 1
