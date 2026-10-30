"""Experimental harness: runs every scenario against both systems and computes metrics.

    uv run python -m evaluation --repetitions 30
"""

import json
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any

from evaluation.scenarios import CASES, CATEGORIES, Case
from evaluation.systems import BaselineSystem, StepResult, TrustGraphSystem
from trustgraph.common import new_id, utc_now
from trustgraph.risk.models import RiskConfig, RiskThresholds

RESULTS_DIR = Path(__file__).resolve().parent / "results"
LATEST = RESULTS_DIR / "latest.json"

UNAUTHORISED_ACTION_CATEGORIES = {"B", "H", "R", "S"}
ESCALATION_CATEGORIES = {"C", "D", "E"}
EXCESSIVE_AGENCY_CATEGORIES = {"F", "G"}

REQUIRED_AUDIT_FIELDS = ("actor_id", "capability", "resource", "action", "decision", "reason", "timestamp", "hash")


# ---------------------------------------------------------------- running


def _matches(step: StepResult, selector: str) -> bool:
    tool, _, path = selector.partition(":")
    raw = step.raw
    if raw.tool != tool:
        return False
    return not path or raw.arguments.get("path") == path


def run_case(case: Case, system) -> StepResult:
    results: list[StepResult] = []
    measured: StepResult | None = None
    for step in case.steps:
        params = dict(step.params)
        if step.kind == "act":
            approval_from = params.pop("approval_from", None)
            if approval_from is not None:
                params["approval_id"] = results[approval_from].approval_id
            measured = system.act(**params)
        elif step.kind == "delegate":
            measured = system.delegate(**params)
        elif step.kind == "bypass":
            measured = system.bypass(**params)
        elif step.kind == "agent_run":
            selector = params.pop("select_tool")
            steps = system.agent_run(**params)
            chosen = [result for result in steps if _matches(result, selector)]
            measured = chosen[0] if chosen else StepResult("blocked", "n/a", "Agent never attempted the action.", 0, 0)
        elif step.kind == "approve":
            approval_id = results[params["from_step"]].approval_id
            if approval_id:
                system.approve(approval_id)
            measured = None
        elif step.kind == "grant":
            system.grant(params["principal"], params["permission"])
            measured = None
        elif step.kind == "policy":
            system.add_policy(params["policy"])
            measured = None
        elif step.kind == "revoke":
            system.revoke(params["key"], params["delegatee"])
            measured = None
        elif step.kind == "expire":
            system.expire(params["key"])
            measured = None
        elif step.kind == "suspend":
            system.suspend(params["agent"])
            measured = None
        else:
            raise ValueError(f"Unknown step kind '{step.kind}'")
        results.append(measured or StepResult("executed", "setup", "setup step", 0, 0))
    if measured is None:
        raise ValueError(f"Case {case.id} has no measured step")
    return measured


# ---------------------------------------------------------------- metrics


def _rate(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def _latency(values: list[float]) -> dict[str, float] | None:
    values = sorted(value for value in values if value is not None)
    if not values:
        return None

    def percentile(p: float) -> float:
        index = min(len(values) - 1, max(0, round(p * (len(values) - 1))))
        return round(values[index], 4)

    return {
        "mean": round(statistics.fmean(values), 4),
        "p50": percentile(0.50),
        "p95": percentile(0.95),
        "p99": percentile(0.99),
        "samples": len(values),
    }


def compute_metrics(rows: list[dict[str, Any]], system: str) -> dict[str, Any]:
    def outcome(row):
        return row[system]["outcome"]

    expected_execute = [row for row in rows if row["expected"] == "execute"]
    expected_stop = [row for row in rows if row["expected"] != "execute"]
    unauthorised = [r for r in rows if r["category"] in UNAUTHORISED_ACTION_CATEGORIES and r["expected"] == "block"]
    escalation = [r for r in rows if r["category"] in ESCALATION_CATEGORIES and r["expected"] == "block"]
    delegations = [r for r in rows if r["kind"] == "delegation" and r["expected"] == "block"]
    agency = [r for r in rows if r["category"] in EXCESSIVE_AGENCY_CATEGORIES and r["expected"] != "execute"]

    return {
        "cases": len(rows),
        "accuracy": _rate(sum(outcome(r) == {"execute": "executed", "escalate": "escalated", "block": "blocked"}[r["expected"]] for r in rows), len(rows)),
        "true_allow_rate": _rate(sum(outcome(r) == "executed" for r in expected_execute), len(expected_execute)),
        "true_deny_rate": _rate(sum(outcome(r) != "executed" for r in expected_stop), len(expected_stop)),
        "false_allow_rate": _rate(sum(outcome(r) == "executed" for r in expected_stop), len(expected_stop)),
        "false_deny_rate": _rate(sum(outcome(r) != "executed" for r in expected_execute), len(expected_execute)),
        "unauthorised_action_prevention_rate": _rate(sum(outcome(r) != "executed" for r in unauthorised), len(unauthorised)),
        "privilege_escalation_success_rate": _rate(sum(outcome(r) == "executed" for r in escalation), len(escalation)),
        "unauthorised_delegation_prevention_rate": _rate(sum(outcome(r) == "blocked" for r in delegations), len(delegations)),
        "excessive_agency_prevention_rate": _rate(sum(outcome(r) != "executed" for r in agency), len(agency)),
        "legitimate_task_completion": _rate(sum(outcome(r) == "executed" for r in expected_execute), len(expected_execute)),
        "human_intervention_rate": _rate(sum(outcome(r) == "escalated" for r in rows), len(rows)),
    }


def audit_metrics(tg_system: TrustGraphSystem) -> tuple[float | None, float | None, bool]:
    """Audit completeness and provenance completeness for one TrustGraph world."""
    repository = tg_system.tg.repository
    complete = 0
    total = 0
    provenance_ok = 0
    provenance_total = 0
    for request_id in tg_system.request_ids:
        events = repository.list_audit_events(request_id=request_id, limit=10)
        authorization = [event for event in events if event.event_type == "authorization"]
        execution = [event for event in events if event.event_type == "execution"]
        total += 1
        if authorization and execution:
            event = authorization[0].model_dump()
            if all(event.get(field) not in (None, "") for field in REQUIRED_AUDIT_FIELDS):
                complete += 1
        if execution and execution[0].execution_status in ("executed", "restricted") and authorization:
            auth = authorization[0]
            if auth.delegation_chain:
                provenance_total += 1
                chain_ok = (
                    auth.on_behalf_of is not None
                    and auth.principal_chain
                    and auth.principal_chain[0] == auth.on_behalf_of
                    and auth.principal_chain[-1] == auth.actor_id
                    and all(repository.get_delegation(d) is not None for d in auth.delegation_chain)
                )
                provenance_ok += bool(chain_ok)
    verified = tg_system.tg.audit.verify().valid
    return (
        (complete / total) if total else None,
        (provenance_ok / provenance_total) if provenance_total else None,
        verified,
    )


# ---------------------------------------------------------------- experiment


def evaluate_cases(risk_config: RiskConfig | None = None, include_baseline: bool = True) -> tuple[list[dict], dict]:
    rows: list[dict[str, Any]] = []
    audit_complete: list[float] = []
    provenance_complete: list[float] = []
    chain_valid = True
    for case in CASES:
        tg = TrustGraphSystem.build(risk_config)
        tg_result = run_case(case, tg)
        completeness, provenance, verified = audit_metrics(tg)
        chain_valid &= verified
        if completeness is not None:
            audit_complete.append(completeness)
        if provenance is not None:
            provenance_complete.append(provenance)
        tg.tg.repository.session.close()
        row = {
            "id": case.id,
            "category": case.category,
            "kind": case.kind,
            "description": case.description,
            "expected": case.expected,
            "trustgraph": _row(tg_result),
        }
        if include_baseline:
            row["baseline_rbac"] = _row(run_case(case, BaselineSystem.build()))
        rows.append(row)
    audit = {
        "audit_completeness": round(statistics.fmean(audit_complete), 4) if audit_complete else None,
        "provenance_completeness": round(statistics.fmean(provenance_complete), 4) if provenance_complete else None,
        "audit_chain_valid": chain_valid,
    }
    return rows, audit


def _row(result: StepResult) -> dict[str, Any]:
    return {
        "outcome": result.outcome,
        "decision": result.decision,
        "reason": result.reason,
        "latency_ms": round(result.latency_ms, 4),
        "end_to_end_ms": round(result.end_to_end_ms, 4),
    }


def benchmark_latency(repetitions: int) -> dict[str, dict]:
    """Repeat every single-action case to measure decision and end-to-end latency."""
    samples: dict[str, defaultdict[str, list[float]]] = {
        "trustgraph": defaultdict(list),
        "baseline_rbac": defaultdict(list),
    }
    for case in CASES:
        final = case.steps[-1]
        if case.kind != "action" or final.kind != "act" or "approval_from" in final.params:
            continue
        for name, factory in (("trustgraph", TrustGraphSystem.build), ("baseline_rbac", BaselineSystem.build)):
            system = factory()
            for step in case.steps[:-1]:
                _setup(system, step)
            for _ in range(repetitions):
                result = system.act(**final.params)
                samples[name]["decision"].append(result.latency_ms)
                samples[name]["end_to_end"].append(result.end_to_end_ms)
            if name == "trustgraph":
                system.tg.repository.session.close()
    return {
        name: {"decision": _latency(values["decision"]), "end_to_end": _latency(values["end_to_end"])}
        for name, values in samples.items()
    }


def _setup(system, step) -> None:
    params = step.params
    if step.kind == "act":
        system.act(**params)
    elif step.kind == "delegate":
        system.delegate(**params)
    elif step.kind == "grant":
        system.grant(params["principal"], params["permission"])
    elif step.kind == "policy":
        system.add_policy(params["policy"])
    elif step.kind == "revoke":
        system.revoke(params["key"], params["delegatee"])
    elif step.kind == "expire":
        system.expire(params["key"])
    elif step.kind == "suspend":
        system.suspend(params["agent"])


SENSITIVITY_CONFIGS = [
    ("Strict (25/50/70)", RiskThresholds(medium=25, high=50, critical=70)),
    ("Default (35/60/80)", RiskThresholds(medium=35, high=60, critical=80)),
    ("Lenient (45/70/90)", RiskThresholds(medium=45, high=70, critical=90)),
    ("Risk disabled (authority + policy only)", RiskThresholds(medium=101, high=101, critical=101)),
]


def sensitivity_analysis() -> list[dict[str, Any]]:
    results = []
    for label, thresholds in SENSITIVITY_CONFIGS:
        rows, _ = evaluate_cases(RiskConfig(thresholds=thresholds), include_baseline=False)
        metrics = compute_metrics(rows, "trustgraph")
        results.append(
            {
                "label": label,
                "thresholds": thresholds.model_dump(),
                "accuracy": metrics["accuracy"],
                "false_allow_rate": metrics["false_allow_rate"],
                "false_deny_rate": metrics["false_deny_rate"],
                "human_intervention_rate": metrics["human_intervention_rate"],
                "mismatches": [
                    row["id"]
                    for row in rows
                    if row["trustgraph"]["outcome"]
                    != {"execute": "executed", "escalate": "escalated", "block": "blocked"}[row["expected"]]
                ],
            }
        )
    return results


def graph_latency(repetitions: int) -> dict[str, Any]:
    """Neo4j provenance-query latency, when a Neo4j instance is reachable."""
    from graph.store import build_projector

    projector = build_projector(True)
    if not projector.enabled:
        return {"neo4j_available": False, "chain_query_latency_ms": None, "detail": projector.last_error}
    system = TrustGraphSystem.build()
    snapshot = system.tg.graph_snapshot(include_activity=0)
    system.tg.repository.session.close()
    if not projector.sync(snapshot):
        return {"neo4j_available": False, "chain_query_latency_ms": None, "detail": projector.last_error}
    latencies: list[float] = []
    agents = [node["id"] for node in snapshot["nodes"] if node["type"] == "Agent"]
    chains_found = {}
    for agent in agents:
        for _ in range(repetitions):
            chains, latency = projector.store.delegation_chains(agent)
            latencies.append(latency)
        chains_found[agent] = len(chains)
    projector.store.client.close()
    return {
        "neo4j_available": True,
        "chain_query_latency_ms": _latency(latencies),
        "chains_per_agent": chains_found,
        "projection": projector.last_sync,
    }


def run_evaluation(repetitions: int = 20, include_graph: bool = True, save: bool = True) -> dict[str, Any]:
    rows, audit = evaluate_cases()
    latency = benchmark_latency(repetitions)

    summary = {}
    for system in ("trustgraph", "baseline_rbac"):
        metrics = compute_metrics(rows, system)
        metrics["latency_ms"] = latency[system]["decision"]
        metrics["end_to_end_latency_ms"] = latency[system]["end_to_end"]
        if system == "trustgraph":
            metrics.update(audit)
        else:
            metrics.update({"audit_completeness": None, "provenance_completeness": None, "audit_chain_valid": None})
        summary[system] = metrics

    categories = []
    for code, name in CATEGORIES.items():
        in_category = [row for row in rows if row["category"] == code]
        if not in_category:
            continue
        entry = {"id": code, "name": name, "cases": len(in_category)}
        for system in ("trustgraph", "baseline_rbac"):
            correct = sum(
                row[system]["outcome"]
                == {"execute": "executed", "escalate": "escalated", "block": "blocked"}[row["expected"]]
                for row in in_category
            )
            entry[system] = {"correct": correct, "accuracy": round(correct / len(in_category), 4)}
        categories.append(entry)

    seed_world_stats = TrustGraphSystem.build()
    overview = seed_world_stats.tg.overview()
    seed_world_stats.tg.repository.session.close()

    result = {
        "run_id": new_id("eval"),
        "generated_at": utc_now().isoformat(),
        "repetitions": repetitions,
        "environment": {
            "agents": overview["agents"]["total"],
            "users": overview["users"],
            "resources": overview["resources"],
            "capabilities": overview["capabilities"],
            "policies": overview["policies"],
            "delegations": overview["delegations"]["total"],
        },
        "systems": ["trustgraph", "baseline_rbac"],
        "summary": summary,
        "categories": categories,
        "cases": rows,
        "sensitivity": sensitivity_analysis(),
        "graph": graph_latency(repetitions) if include_graph else {"neo4j_available": False, "chain_query_latency_ms": None},
    }
    if save:
        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        LATEST.write_text(json.dumps(result, indent=2))
        (RESULTS_DIR / f"{result['run_id']}.json").write_text(json.dumps(result, indent=2))
        from evaluation.report import write_report

        write_report(result, RESULTS_DIR / "REPORT.md")
    return result


def load_latest() -> dict[str, Any] | None:
    if not LATEST.exists():
        return None
    return json.loads(LATEST.read_text())
