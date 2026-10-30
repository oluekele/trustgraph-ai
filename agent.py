"""Run a governed agent task from the command line against a fresh seed world.

    uv run python agent.py agent-research "Read /research/report.pdf and summarise it" --purpose "Market study"
    uv run python agent.py agent-orchestrator "Read /research/vendor-brief.txt" --planner auto
"""

import argparse
import json

from ai_agent.providers.provider_manager import build_planner
from ai_agent.runtime import AgentRuntime
from ai_agent.tools.registry import TicketAuthority, ToolRegistry
from trustgraph.persistence.database import create_database_engine, create_schema, make_session_factory
from trustgraph.seed import seed_world
from trustgraph.service import TrustGraph
from trustgraph.settings import get_settings


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("agent_id")
    parser.add_argument("task")
    parser.add_argument("--purpose", default=None)
    parser.add_argument("--planner", default="auto", choices=["auto", "gemini", "openai", "grok"])
    parser.add_argument("--max-steps", type=int, default=6)
    args = parser.parse_args()

    engine = create_database_engine("sqlite://")
    create_schema(engine)
    with make_session_factory(engine)() as session:
        tg = TrustGraph(session, tools=ToolRegistry(TicketAuthority("cli")))
        seed_world(tg)
        planner = build_planner(args.planner, get_settings())
        run = AgentRuntime(tg.enforcer, args.agent_id, planner, tg.tools.specs()).run(
            args.task, purpose=args.purpose, max_steps=args.max_steps, on_step=tg.commit
        )
        print(f"planner: {run.planner}")
        for step in run.steps:
            print(f"[{step.index}] {step.tool} {json.dumps(step.arguments)}\n"
                  f"     → {step.status} ({step.decision}) {step.reason}")
        print(f"\nfinal: {run.final_answer or run.error or run.stopped_reason}")


if __name__ == "__main__":
    main()
