"""Render evaluation results as Markdown for the dissertation appendix."""

from pathlib import Path
from typing import Any

METRIC_LABELS = [
    ("accuracy", "Decision accuracy"),
    ("false_allow_rate", "False-allow rate"),
    ("false_deny_rate", "False-deny rate"),
    ("unauthorised_action_prevention_rate", "Unauthorised-action prevention"),
    ("privilege_escalation_success_rate", "Privilege-escalation success"),
    ("unauthorised_delegation_prevention_rate", "Unauthorised-delegation prevention"),
    ("excessive_agency_prevention_rate", "Excessive-agency prevention"),
    ("legitimate_task_completion", "Legitimate task completion"),
    ("human_intervention_rate", "Human intervention rate"),
    ("audit_completeness", "Audit completeness"),
    ("provenance_completeness", "Provenance completeness"),
]


def _pct(value: Any) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def _ms(latency: dict | None, key: str) -> str:
    return "n/a" if not latency else f"{latency[key]:.3f}"


def render(result: dict[str, Any]) -> str:
    tg = result["summary"]["trustgraph"]
    base = result["summary"]["baseline_rbac"]
    env = result["environment"]
    lines = [
        "# TrustGraph AI — Experimental Evaluation",
        "",
        f"Run `{result['run_id']}` at {result['generated_at']} · latency repetitions per case: {result['repetitions']}",
        "",
        f"Environment: {env['agents']} agents, {env['users']} users, {env['resources']} resources, "
        f"{env['capabilities']} capabilities, {env['policies']} policies, {env['delegations']} seed delegations; "
        f"{len(result['cases'])} scenarios, each run in a freshly seeded isolated world.",
        "",
        "## Summary",
        "",
        "| Metric | TrustGraph AI | Static RBAC baseline |",
        "|---|---|---|",
    ]
    for key, label in METRIC_LABELS:
        lines.append(f"| {label} | {_pct(tg.get(key))} | {_pct(base.get(key))} |")
    for key, label in (("latency_ms", "Decision latency"), ("end_to_end_latency_ms", "End-to-end governed call")):
        lines.append(
            f"| {label} p50 / p95 (ms) | {_ms(tg[key], 'p50')} / {_ms(tg[key], 'p95')} "
            f"| {_ms(base[key], 'p50')} / {_ms(base[key], 'p95')} |"
        )
    lines.append(f"| Audit hash chain verified | {tg.get('audit_chain_valid')} | n/a |")

    lines += ["", "## Results by scenario category", "", "| Category | Cases | TrustGraph correct | Baseline correct |", "|---|---|---|---|"]
    for category in result["categories"]:
        lines.append(
            f"| {category['id']} — {category['name']} | {category['cases']} "
            f"| {category['trustgraph']['correct']} | {category['baseline_rbac']['correct']} |"
        )

    lines += ["", "## Risk-threshold sensitivity (TrustGraph only)", "",
              "| Configuration | Accuracy | False-allow | False-deny | Human intervention | Mismatched cases |",
              "|---|---|---|---|---|---|"]
    for row in result["sensitivity"]:
        lines.append(
            f"| {row['label']} | {_pct(row['accuracy'])} | {_pct(row['false_allow_rate'])} "
            f"| {_pct(row['false_deny_rate'])} | {_pct(row['human_intervention_rate'])} "
            f"| {', '.join(row['mismatches']) or '—'} |"
        )

    graph = result["graph"]
    lines += ["", "## Graph provenance queries", ""]
    if graph.get("neo4j_available") and graph.get("chain_query_latency_ms"):
        latency = graph["chain_query_latency_ms"]
        lines.append(
            f"Neo4j delegation-chain query latency: mean {latency['mean']:.2f} ms, "
            f"p50 {latency['p50']:.2f} ms, p95 {latency['p95']:.2f} ms ({latency['samples']} samples)."
        )
    else:
        lines.append("Neo4j was not available for this run; graph latency was not measured.")

    lines += ["", "## Case results", "", "| Case | Expected | TrustGraph | Baseline | TrustGraph reason |", "|---|---|---|---|---|"]
    for row in result["cases"]:
        lines.append(
            f"| {row['id']} {row['description']} | {row['expected']} | {row['trustgraph']['outcome']} "
            f"| {row['baseline_rbac']['outcome']} | {row['trustgraph']['reason'].replace('|', '/')} |"
        )
    lines += [
        "",
        "## Notes on interpretation",
        "",
        "- Results come from a controlled synthetic environment and a deliberately static baseline; they "
        "demonstrate the behaviour of the mechanisms, not production security guarantees.",
        "- Expected outcomes are the scenario designer's ground truth. Risk weights and thresholds are "
        "experimental parameters; the sensitivity table shows how decisions shift as they change.",
        "- Prompt-injection cases use a deliberately vulnerable planner that obeys injected text, isolating "
        "the effect of the governance layer from the LLM's own robustness.",
    ]
    return "\n".join(lines) + "\n"


def write_report(result: dict[str, Any], path: Path) -> None:
    path.write_text(render(result))
