import argparse
import logging

from evaluation.harness import LATEST, RESULTS_DIR, run_evaluation


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the TrustGraph AI controlled experiment.")
    parser.add_argument("--repetitions", type=int, default=30, help="latency samples per action case")
    parser.add_argument("--no-graph", action="store_true", help="skip Neo4j latency measurement")
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING)

    result = run_evaluation(repetitions=args.repetitions, include_graph=not args.no_graph)
    tg, base = result["summary"]["trustgraph"], result["summary"]["baseline_rbac"]
    print(f"Cases: {len(result['cases'])}")
    for key in ("accuracy", "false_allow_rate", "false_deny_rate", "privilege_escalation_success_rate",
                "legitimate_task_completion"):
        print(f"  {key:38} trustgraph={tg[key]}  baseline={base[key]}")
    print(f"  decision latency p95 (ms)             trustgraph={tg['latency_ms']['p95']}  baseline={base['latency_ms']['p95']}")
    print(f"Results: {LATEST}\nReport:  {RESULTS_DIR / 'REPORT.md'}")


if __name__ == "__main__":
    main()
