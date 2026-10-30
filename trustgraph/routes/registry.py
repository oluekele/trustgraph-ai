"""Identity, capability, resource, grant and policy administration."""

from fastapi import APIRouter, Depends, Query, status

from trustgraph.audit.models import AuditEventType
from trustgraph.capability.models import Capability, Permission, Resource
from trustgraph.common import utc_now
from trustgraph.errors import ConflictError, NotFoundError
from trustgraph.identity.models import Principal, PrincipalKind
from trustgraph.policy.models import Policy
from trustgraph.routes.deps import get_tg, operator_id, require_service
from trustgraph.schemas import GrantCreate, PrincipalCreate, RevokeBody, StatusUpdate
from trustgraph.service import TrustGraph

router = APIRouter(dependencies=[Depends(require_service)])


def _authority_summary(tg: TrustGraph, principal_id: str) -> dict:
    authority = tg.reconstructor.reconstruct(principal_id)
    grouped: dict[tuple, list] = {}
    for path in authority.paths:
        grouped.setdefault(path.permission.key, []).append(path.model_dump(mode="json"))
    return {
        "principal_id": principal_id,
        "permissions": [
            {
                "permission": {"capability": key[0], "resource": key[1], "action": key[2]},
                "paths": paths,
                "direct": any(not path["chain"] for path in paths),
                "delegable": any(path["remaining_depth"] >= 1 for path in paths),
            }
            for key, paths in sorted(grouped.items())
        ],
    }


# ---------------------------------------------------------------- principals


@router.get("/principals", tags=["identity"])
def list_principals(kind: PrincipalKind | None = None, tg: TrustGraph = Depends(get_tg)) -> list[Principal]:
    return tg.identity.list(kind)


@router.post("/principals", status_code=status.HTTP_201_CREATED, tags=["identity"])
def register_principal(
    body: PrincipalCreate, tg: TrustGraph = Depends(get_tg), operator: str = Depends(operator_id)
) -> dict:
    principal, api_key = tg.identity.register(Principal(**body.model_dump()), actor_id=operator)
    tg.commit()
    return {"principal": principal.model_dump(mode="json"), "api_key": api_key}


@router.get("/principals/{principal_id}", tags=["identity"])
def get_principal(principal_id: str, tg: TrustGraph = Depends(get_tg)) -> dict:
    principal = tg.identity.require(principal_id)
    now = utc_now()
    delegations = tg.delegations.list(principal_id)
    return {
        "principal": principal.model_dump(mode="json"),
        "authority": _authority_summary(tg, principal_id),
        "grants": [grant.model_dump(mode="json") for grant in tg.direct_authority.list(principal_id)],
        "delegations": [
            {**delegation.model_dump(mode="json"), "effective_status": delegation.effective_status(now).value}
            for delegation in delegations
        ],
        "owned_agents": [
            other.id for other in tg.identity.list(PrincipalKind.AGENT) if other.owner_id == principal_id
        ],
    }


@router.get("/principals/{principal_id}/authority", tags=["identity"])
def effective_authority(principal_id: str, tg: TrustGraph = Depends(get_tg)) -> dict:
    tg.identity.require(principal_id)
    return _authority_summary(tg, principal_id)


@router.patch("/principals/{principal_id}/status", tags=["identity"])
def set_status(
    principal_id: str, body: StatusUpdate, tg: TrustGraph = Depends(get_tg), operator: str = Depends(operator_id)
) -> Principal:
    principal = tg.identity.set_status(principal_id, body.status, actor_id=operator)
    tg.commit()
    return principal


@router.post("/principals/{principal_id}/rotate-key", tags=["identity"])
def rotate_key(principal_id: str, tg: TrustGraph = Depends(get_tg)) -> dict:
    api_key = tg.identity.rotate_api_key(principal_id)
    tg.commit()
    return {"principal_id": principal_id, "api_key": api_key}


# ------------------------------------------------------ capabilities/resources


@router.get("/capabilities", tags=["catalogue"])
def list_capabilities(tg: TrustGraph = Depends(get_tg)) -> list[Capability]:
    return tg.repository.list_capabilities()


@router.post("/capabilities", status_code=status.HTTP_201_CREATED, tags=["catalogue"])
def register_capability(body: Capability, tg: TrustGraph = Depends(get_tg)) -> Capability:
    capability = tg.catalog.register_capability(body)
    tg.commit()
    return capability


@router.get("/resources", tags=["catalogue"])
def list_resources(tg: TrustGraph = Depends(get_tg)) -> list[Resource]:
    return tg.repository.list_resources()


@router.post("/resources", status_code=status.HTTP_201_CREATED, tags=["catalogue"])
def register_resource(body: Resource, tg: TrustGraph = Depends(get_tg)) -> Resource:
    resource = tg.catalog.register_resource(body)
    tg.commit()
    return resource


# ------------------------------------------------------------- direct grants


@router.get("/grants", tags=["authority"])
def list_grants(principal_id: str | None = None, tg: TrustGraph = Depends(get_tg)) -> list[dict]:
    now = utc_now()
    return [
        {**grant.model_dump(mode="json"), "valid": grant.is_valid(now)}
        for grant in tg.direct_authority.list(principal_id)
    ]


@router.post("/grants", status_code=status.HTTP_201_CREATED, tags=["authority"])
def create_grant(body: GrantCreate, tg: TrustGraph = Depends(get_tg), operator: str = Depends(operator_id)) -> dict:
    grant = tg.direct_authority.grant(
        body.principal_id,
        Permission(capability=body.capability, resource=body.resource, action=body.action),
        max_delegation_depth=body.max_delegation_depth,
        expires_at=body.expires_at,
        granted_by=operator,
    )
    tg.commit()
    return grant.model_dump(mode="json")


@router.post("/grants/{grant_id}/revoke", tags=["authority"])
def revoke_grant(grant_id: str, tg: TrustGraph = Depends(get_tg), operator: str = Depends(operator_id)) -> dict:
    grant, cascaded = tg.revoke_grant(grant_id, operator)
    tg.commit()
    return {
        "grant": grant.model_dump(mode="json"),
        "cascaded_delegations": [delegation.id for delegation in cascaded],
    }


# ------------------------------------------------------------------ policies


@router.get("/policies", tags=["policy"])
def list_policies(tg: TrustGraph = Depends(get_tg)) -> list[Policy]:
    return tg.repository.list_policies()


@router.post("/policies", status_code=status.HTTP_201_CREATED, tags=["policy"])
def create_policy(body: Policy, tg: TrustGraph = Depends(get_tg), operator: str = Depends(operator_id)) -> Policy:
    if tg.repository.get_policy(body.id) is not None:
        raise ConflictError(f"Policy '{body.id}' already exists.")
    policy = body.model_copy(update={"version": 1, "created_at": utc_now(), "updated_at": utc_now()})
    tg.repository.upsert_policy(policy)
    tg.audit.record(
        AuditEventType.POLICY_CHANGED, actor_id=operator, reason="created", details={"policy_id": policy.id}
    )
    tg.commit()
    return policy


@router.put("/policies/{policy_id}", tags=["policy"])
def update_policy(
    policy_id: str, body: Policy, tg: TrustGraph = Depends(get_tg), operator: str = Depends(operator_id)
) -> Policy:
    existing = tg.repository.get_policy(policy_id)
    if existing is None:
        raise NotFoundError(f"Policy '{policy_id}' not found.")
    policy = body.model_copy(
        update={
            "id": policy_id,
            "version": existing.version + 1,
            "created_at": existing.created_at,
            "updated_at": utc_now(),
        }
    )
    tg.repository.upsert_policy(policy)
    tg.audit.record(
        AuditEventType.POLICY_CHANGED,
        actor_id=operator,
        reason=f"updated to v{policy.version}",
        details={"policy_id": policy_id, "policy": policy.model_dump(mode="json")},
    )
    tg.commit()
    return policy


@router.delete("/policies/{policy_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["policy"])
def delete_policy(policy_id: str, tg: TrustGraph = Depends(get_tg), operator: str = Depends(operator_id)) -> None:
    tg.repository.delete_policy(policy_id)
    tg.audit.record(
        AuditEventType.POLICY_CHANGED, actor_id=operator, reason="deleted", details={"policy_id": policy_id}
    )
    tg.commit()
