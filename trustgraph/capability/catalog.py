"""Catalogue of technical capabilities and protected resources."""

import posixpath
from urllib.parse import urlsplit

from trustgraph.capability.models import Capability, Permission, Resource
from trustgraph.errors import ValidationError
from trustgraph.persistence.repository import Repository


def canonical_resource(uri: str) -> str:
    """Normalise a resource URI so equivalent spellings cannot bypass checks.

    ``file:///research/../hr/salaries.csv`` becomes ``file:///hr/salaries.csv``,
    which is then matched against the real resource's policies.
    """
    uri = uri.strip()
    if not uri:
        raise ValidationError("Resource identifier cannot be empty.")
    parts = urlsplit(uri)
    if not parts.scheme:
        raise ValidationError(f"Resource '{uri}' must be a URI with a scheme.")
    scheme = parts.scheme.lower()
    if scheme == "file":
        path = parts.path or "/"
        if "\x00" in path:
            raise ValidationError("Resource path contains a NUL byte.")
        normalised = posixpath.normpath("/" + path.lstrip("/"))
        return f"file://{normalised}"
    path = parts.path.rstrip("/") if parts.path not in ("", "/") else ""
    query = f"?{parts.query}" if parts.query else ""
    return f"{scheme}://{parts.netloc.lower()}{path}{query}"


class CatalogService:
    def __init__(self, repository: Repository):
        self.repository = repository

    def register_capability(self, capability: Capability) -> Capability:
        return self.repository.upsert_capability(capability)

    def register_resource(self, resource: Resource) -> Resource:
        resource = resource.model_copy(update={"id": canonical_resource(resource.id)})
        if not resource.allowed_actions:
            raise ValidationError("A protected resource must declare its allowed actions.")
        return self.repository.upsert_resource(resource)

    def validate_permission(self, permission: Permission) -> list[str]:
        """Return reasons why the permission tuple is not well-formed."""
        problems: list[str] = []
        capability = self.repository.get_capability(permission.capability)
        if capability is None:
            problems.append(f"Unknown capability '{permission.capability}'.")
        elif capability.actions and permission.action not in capability.actions:
            problems.append(
                f"Capability '{permission.capability}' does not support action "
                f"'{permission.action}'."
            )
        resource = self.repository.get_resource(permission.resource)
        if resource is None:
            problems.append(f"Unknown protected resource '{permission.resource}'.")
        elif permission.action not in resource.allowed_actions:
            problems.append(
                f"Action '{permission.action}' is not defined for resource '{resource.id}'."
            )
        return problems
