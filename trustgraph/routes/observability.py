"""Overview, audit, provenance, graph, risk configuration and evaluation."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text

from trustgraph.capability.models import Permission
from trustgraph.routes.deps import AppRuntime, get_tg, operator_id, require_service, runtime
from trustgraph.schemas import EvaluationRunBody
from trustgraph.service import TrustGraph

router = APIRouter(dependencies=[Depends(require_service)])


@router.get("/overview", tags=["observability"])
def overview(tg: TrustGraph = Depends(get_tg), rt: AppRuntime = Depends(runtime)) -> dict:
    data = tg.overview()
    data["neo4j"] = {
        "enabled": rt.projector.enabled,
        "last_sync": rt.projector.last_sync,
        "last_error": rt.projector.last_error,
    }
    return data


# ---------------------------------------------------------------------- audit


@router.get("/audit", tags=["audit"])
def audit_events(
    actor_id: str | None = None,
    event_type: str | None = None,
    decision: str | None = None,
    request_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    tg: TrustGraph = Depends(get_tg),
) -> dict:
    events = tg.repository.list_audit_events(
        actor_id=actor_id,
        event_type=event_type,
        decision=decision,
        request_id=request_id,
        limit=limit,
        offset=offset,
    )
    return {
        "total": tg.repository.count_audit_events(),
        "events": [event.model_dump(mode="json") for event in events],
    }


@router.get("/audit/verify", tags=["audit"])
def verify_audit(tg: TrustGraph = Depends(get_tg)) -> dict:
    return tg.audit.verify().model_dump()


# ---------------------------------------------------------- graph/provenance


@router.get("/graph", tags=["graph"])
def graph(activity: int = Query(default=50, ge=0, le=500), tg: TrustGraph = Depends(get_tg)) -> dict:
    return tg.graph_snapshot(include_activity=activity)


@router.get("/provenance", tags=["graph"])
def provenance(
    agent_id: str, capability: str, resource: str, action: str, tg: TrustGraph = Depends(get_tg)
) -> dict:
    tg.identity.require(agent_id)
    return tg.provenance(agent_id, Permission(capability=capability, resource=resource, action=action))


@router.post("/graph/sync", tags=["graph"])
def sync_graph(tg: TrustGraph = Depends(get_tg), rt: AppRuntime = Depends(runtime)) -> dict:
    if not rt.projector.enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, rt.projector.last_error or "Neo4j disabled.")
    ok = rt.projector.sync(tg.graph_snapshot())
    return {"synced": ok, "counts": rt.projector.last_sync, "error": rt.projector.last_error}


@router.get("/graph/neo4j/chains/{agent_id}", tags=["graph"])
def neo4j_chains(agent_id: str, rt: AppRuntime = Depends(runtime)) -> dict:
    if not rt.projector.enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, rt.projector.last_error or "Neo4j disabled.")
    chains, latency = rt.projector.store.delegation_chains(agent_id)
    dependents, blast_latency = rt.projector.store.blast_radius(agent_id)
    return {
        "agent_id": agent_id,
        "chains": chains,
        "dependents": dependents,
        "latency_ms": {"chains": round(latency, 3), "blast_radius": round(blast_latency, 3)},
    }


# ----------------------------------------------------------------- risk config


@router.get("/risk/config", tags=["risk"])
def risk_config(rt: AppRuntime = Depends(runtime)) -> dict:
    from trustgraph.risk.action_sensitivity import ActionSensitivityAnalyzer
    from trustgraph.risk.delegation_risk import DelegationRiskAnalyzer

    return {
        **rt.risk_config.model_dump(),
        "action_sensitivity": ActionSensitivityAnalyzer.ACTION_SENSITIVITY,
        "delegation_hop_risk": DelegationRiskAnalyzer.HOP_RISK,
        "decision_mapping": {
            "low": "allow",
            "medium": "restrict",
            "high": "require_approval",
            "critical": "deny",
        },
    }


# ------------------------------------------------------------------ evaluation


@router.get("/evaluation/latest", tags=["evaluation"])
def latest_evaluation() -> dict:
    from evaluation.harness import load_latest

    result = load_latest()
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No evaluation has been run yet.")
    return result


@router.post("/evaluation/run", tags=["evaluation"])
def run_evaluation(body: EvaluationRunBody | None = None) -> dict:
    """Run the controlled experiment (isolated in-memory databases; no live data touched)."""
    from evaluation.harness import run_evaluation as run

    return run(repetitions=body.repetitions if body else 20)


# ---------------------------------------------------------------------- admin


@router.post("/admin/reset", tags=["admin"])
def reset(rt: AppRuntime = Depends(runtime), operator: str = Depends(operator_id)) -> dict:
    """Rebuild the demonstration environment (drops all governance data)."""
    from trustgraph.api import reset_environment

    keys = reset_environment(rt)
    return {"reset_by": operator, "agent_api_keys": keys}


health_router = APIRouter(tags=["health"])


@health_router.get("/health")
def health(rt: AppRuntime = Depends(runtime)) -> dict:
    database = "ok"
    try:
        with rt.session_factory() as session:
            session.execute(text("SELECT 1"))
    except Exception as exc:
        database = f"error: {type(exc).__name__}"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "database": database,
        "neo4j": "enabled" if rt.projector.enabled else "disabled",
    }
