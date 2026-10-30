from datetime import timedelta

import pytest
from pydantic import ValidationError as PydanticValidationError

from trustgraph.capability.models import Permission
from trustgraph.common import utc_now
from trustgraph.delegation.models import Delegation, DelegationRequest, DelegationStatus

READ = Permission(capability="database.read", resource="db://crm/customers", action="read")


def make(**overrides):
    return Delegation(id="d-1", delegator_id="u-a", delegatee_id="agent-b", grants=[READ], **overrides)


def test_active_unexpired_delegation_is_valid():
    assert make().is_valid(utc_now())


def test_expired_delegation_reports_expired_status():
    delegation = make(expires_at=utc_now() - timedelta(seconds=1))
    assert not delegation.is_valid(utc_now())
    assert delegation.effective_status(utc_now()) == DelegationStatus.EXPIRED


def test_revoked_delegation_is_invalid():
    assert not make(status=DelegationStatus.REVOKED).is_valid(utc_now())


def test_request_requires_at_least_one_grant():
    with pytest.raises(PydanticValidationError):
        DelegationRequest(delegator_id="u-a", delegatee_id="agent-b", grants=[])


def test_permissions_are_hashable_value_objects():
    same = Permission(capability="database.read", resource="db://crm/customers", action="read")
    assert same == READ and len({READ, same}) == 1
    assert str(READ) == "database.read → db://crm/customers → read"
