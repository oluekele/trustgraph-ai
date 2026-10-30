"""Invalid grants are rejected before any graph projection happens."""

import pytest

from trustgraph.capability.models import Permission
from trustgraph.errors import NotFoundError, ValidationError


def test_grant_to_unknown_principal(tg):
    with pytest.raises(NotFoundError):
        tg.direct_authority.grant("agent-ghost", Permission(
            capability="calculator.execute", resource="tool://calculator", action="execute"))


def test_grant_on_unknown_resource(tg):
    with pytest.raises(ValidationError, match="Unknown protected resource"):
        tg.direct_authority.grant("u-ada", Permission(
            capability="file.read", resource="file:///nowhere.txt", action="read"))


def test_expired_grant_is_rejected(tg):
    from datetime import timedelta

    from trustgraph.common import utc_now

    with pytest.raises(ValidationError, match="future"):
        tg.direct_authority.grant("u-ada", Permission(
            capability="calculator.execute", resource="tool://calculator", action="execute"),
            expires_at=utc_now() - timedelta(minutes=1))
