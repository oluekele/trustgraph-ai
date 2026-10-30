"""Delegation creation, inspection and (cascading) revocation."""

from fastapi import APIRouter, Depends, Query, Response, status

from trustgraph.common import utc_now
from trustgraph.delegation.models import Delegation, DelegationRequest, DelegationStatus
from trustgraph.routes.deps import get_tg, operator_id, require_service
from trustgraph.schemas import RevokeBody
from trustgraph.service import TrustGraph

router = APIRouter(prefix="/delegations", tags=["delegation"], dependencies=[Depends(require_service)])


def _view(tg: TrustGraph, delegation: Delegation) -> dict:
    return {
        **delegation.model_dump(mode="json"),
        "effective_status": delegation.effective_status(utc_now()).value,
    }


@router.get("")
def list_delegations(
    principal_id: str | None = None,
    status_filter: DelegationStatus | None = Query(default=None, alias="status"),
    tg: TrustGraph = Depends(get_tg),
) -> list[dict]:
    return [_view(tg, delegation) for delegation in tg.delegations.list(principal_id, status_filter)]


@router.get("/{delegation_id}")
def get_delegation(delegation_id: str, tg: TrustGraph = Depends(get_tg)) -> dict:
    delegation = tg.delegations.get(delegation_id)
    chain = []
    current = delegation
    while current is not None:
        chain.insert(0, _view(tg, current))
        current = (
            tg.repository.get_delegation(current.parent_delegation_id)
            if current.parent_delegation_id
            else None
        )
    children = [
        _view(tg, other)
        for other in tg.delegations.list()
        if other.parent_delegation_id == delegation_id
    ]
    return {"delegation": _view(tg, delegation), "chain": chain, "children": children}


@router.post("")
def create_delegation(
    body: DelegationRequest,
    response: Response,
    tg: TrustGraph = Depends(get_tg),
    operator: str = Depends(operator_id),
) -> dict:
    """Validate and create a delegation.

    A rejected delegation is a governance decision, not a malformed request:
    it returns 200 with ``accepted: false`` and the violated rules.
    """
    result = tg.delegations.create_delegation(body, created_by=operator)
    tg.commit()
    if result.accepted:
        response.status_code = status.HTTP_201_CREATED
    return result.model_dump(mode="json")


@router.post("/{delegation_id}/revoke")
def revoke_delegation(
    delegation_id: str,
    body: RevokeBody | None = None,
    tg: TrustGraph = Depends(get_tg),
    operator: str = Depends(operator_id),
) -> dict:
    reason = body.reason if body else "Revoked by operator."
    revoked = tg.delegations.revoke_delegation(delegation_id, revoked_by=operator, reason=reason)
    tg.commit()
    return {"revoked": [_view(tg, delegation) for delegation in revoked]}
