"""EffectiveAuthority value object."""

from trustgraph.capability.models import Permission
from trustgraph.delegation.authority import EffectiveAuthority
from trustgraph.delegation.provenance import AuthorityPath

READ = Permission(capability="database.read", resource="db://crm/customers", action="read")


def path(chain, remaining):
    return AuthorityPath(
        permission=READ,
        root_principal_id="u-root",
        root_grant_id="g-1",
        chain=chain,
        principals=["u-root", *[f"a{i}" for i in range(len(chain))]],
        remaining_depth=remaining,
    )


def test_exact_grant_lookup():
    authority = EffectiveAuthority(principal_id="a", paths=[path([], 1)])
    assert authority.has_exact_grant("database.read", "db://crm/customers", "read")
    assert not authority.has_exact_grant("database.read", "db://crm/customers", "write")
    assert not authority.has_exact_grant("database.read", "db://crm/notes", "read")


def test_best_path_prefers_shortest_chain():
    authority = EffectiveAuthority(principal_id="a", paths=[path(["d1", "d2"], 0), path(["d3"], 0)])
    assert authority.best_path(READ).chain == ["d3"]


def test_best_delegable_path_prefers_most_headroom():
    authority = EffectiveAuthority(principal_id="a", paths=[path(["d1"], 1), path(["d2", "d3"], 2), path([], 0)])
    assert authority.best_delegable_path(READ).chain == ["d2", "d3"]


def test_no_delegable_path_when_depth_exhausted():
    authority = EffectiveAuthority(principal_id="a", paths=[path(["d1"], 0)])
    assert authority.best_delegable_path(READ) is None
    assert authority.permissions() == {READ}
