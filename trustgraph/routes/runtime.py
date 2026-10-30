"""Runtime governance: authorisation, governed execution, approvals, agent runs."""

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from trustgraph.approval.models import ApprovalStatus
from trustgraph.authorization.models import AuthorizationRequest, RequestContext
from trustgraph.common import utc_now
from trustgraph.routes.deps import AppRuntime, get_tg, operator_id, require_service, runtime
from trustgraph.schemas import AgentRunBody, ApprovalDecisionBody, AuthorizeBody, ExecuteBody
from trustgraph.service import TrustGraph
from trustgraph.settings import get_settings

router = APIRouter(tags=["runtime"])


def caller_identity(
    rt: AppRuntime = Depends(runtime),
    tg: TrustGraph = Depends(get_tg),
    x_agent_key: str | None = Header(default=None),
    x_service_token: str | None = Header(default=None),
) -> str | None:
    """Agents authenticate with their own API key; the gateway with the service token.

    Returns the authenticated agent id, or ``None`` for an authenticated
    operator/gateway call (dashboard simulation).
    """
    if x_agent_key:
        principal = tg.identity.authenticate(x_agent_key)
        if principal is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid agent API key.")
        return principal.id
    require_service(rt, x_service_token)
    return None


@router.post("/authorize")
def authorize(
    body: AuthorizeBody,
    tg: TrustGraph = Depends(get_tg),
    authenticated: str | None = Depends(caller_identity),
    operator: str = Depends(operator_id),
) -> dict:
    """Policy decision point for external enforcement points."""
    context = body.context
    if authenticated is None:
        context = context.model_copy(update={"source": f"simulation:{operator}"})
    decision = tg.authorize(
        AuthorizationRequest(
            agent_id=body.agent_id,
            capability=body.capability,
            resource=body.resource,
            action=body.action,
            arguments=body.arguments,
            context=context,
            approval_id=body.approval_id,
            authenticated_principal_id=authenticated,
        )
    )
    tg.commit()
    return decision.model_dump(mode="json")


@router.post("/execute")
def execute(
    body: ExecuteBody,
    tg: TrustGraph = Depends(get_tg),
    authenticated: str | None = Depends(caller_identity),
    operator: str = Depends(operator_id),
) -> dict:
    """Governed tool execution (policy decision + enforcement in one call)."""
    context = body.context
    if authenticated is None:
        context = context.model_copy(update={"source": f"operator:{operator}"})
    result = tg.enforcer.execute(
        body.agent_id,
        body.tool,
        body.arguments,
        context,
        approval_id=body.approval_id,
        authenticated_principal_id=authenticated,
    )
    tg.commit()
    return result.model_dump(mode="json")


@router.get("/tools", dependencies=[Depends(require_service)])
def list_tools(tg: TrustGraph = Depends(get_tg)) -> list[dict]:
    return [spec.to_metadata() for spec in tg.tools.specs()]


@router.get("/sandbox", dependencies=[Depends(require_service)])
def sandbox_state(tg: TrustGraph = Depends(get_tg)) -> dict:
    """Side effects in the synthetic environment (proves what did or did not execute)."""
    sandbox = tg.tools.sandbox
    return {
        "outbox": sandbox.outbox,
        "ledger": sandbox.ledger,
        "deployments": sandbox.deployments,
        "customers": len(sandbox.tables["customers"]),
        "files": sorted(sandbox.files),
    }


# ------------------------------------------------------------------ approvals


@router.get("/approvals", dependencies=[Depends(require_service)])
def list_approvals(
    status_filter: ApprovalStatus | None = Query(default=None, alias="status"),
    tg: TrustGraph = Depends(get_tg),
) -> list[dict]:
    now = utc_now()
    return [
        {**approval.model_dump(mode="json"), "effective_status": approval.effective_status(now).value}
        for approval in tg.approvals.list(status_filter)
    ]


@router.get("/approvals/{approval_id}", dependencies=[Depends(require_service)])
def get_approval(approval_id: str, tg: TrustGraph = Depends(get_tg)) -> dict:
    approval = tg.approvals.get(approval_id)
    return {**approval.model_dump(mode="json"), "effective_status": approval.effective_status(utc_now()).value}


@router.post("/approvals/{approval_id}/approve", dependencies=[Depends(require_service)])
def approve(
    approval_id: str,
    body: ApprovalDecisionBody | None = None,
    tg: TrustGraph = Depends(get_tg),
    operator: str = Depends(operator_id),
) -> dict:
    approval = tg.approvals.decide(approval_id, True, operator, body.note if body else None)
    tg.commit()
    return approval.model_dump(mode="json")


@router.post("/approvals/{approval_id}/reject", dependencies=[Depends(require_service)])
def reject(
    approval_id: str,
    body: ApprovalDecisionBody | None = None,
    tg: TrustGraph = Depends(get_tg),
    operator: str = Depends(operator_id),
) -> dict:
    approval = tg.approvals.decide(approval_id, False, operator, body.note if body else None)
    tg.commit()
    return approval.model_dump(mode="json")


@router.post("/approvals/{approval_id}/execute", dependencies=[Depends(require_service)])
def execute_approved(approval_id: str, tg: TrustGraph = Depends(get_tg), operator: str = Depends(operator_id)) -> dict:
    """Re-submit the exact approved action. Authority, policy and risk are re-evaluated."""
    approval = tg.approvals.get(approval_id)
    if not approval.tool_name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Approval was not raised by a tool call.")
    result = tg.enforcer.execute(
        approval.agent_id,
        approval.tool_name,
        approval.arguments,
        RequestContext(purpose=approval.purpose, source=f"approval-resume:{operator}"),
        approval_id=approval_id,
    )
    tg.commit()
    return result.model_dump(mode="json")


# ------------------------------------------------------------------ agent runs


@router.post("/agents/{agent_id}/run", dependencies=[Depends(require_service)])
def run_agent(agent_id: str, body: AgentRunBody, tg: TrustGraph = Depends(get_tg)) -> dict:
    """Run an agent task; every tool call the planner makes is governed."""
    from ai_agent.runtime import AgentRuntime, build_planner

    tg.identity.require(agent_id)
    planner = build_planner(body.planner, get_settings(), script=body.script)
    run = AgentRuntime(tg.enforcer, agent_id, planner, tool_specs=tg.tools.specs()).run(
        body.task, purpose=body.purpose, max_steps=body.max_steps, on_step=tg.commit
    )
    tg.commit()
    return run.model_dump(mode="json")
