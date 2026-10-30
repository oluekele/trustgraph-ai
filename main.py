"""Console walkthrough of the TrustGraph scenarios (no servers required).

    uv run python main.py
"""

from ai_agent.tools.registry import TicketAuthority, ToolRegistry
from trustgraph.authorization.models import RequestContext
from trustgraph.persistence.database import create_database_engine, create_schema, make_session_factory
from trustgraph.seed import seed_world
from trustgraph.service import TrustGraph

WALKTHROUGH = [
    ("Legitimate low-risk read", "agent-research", "file_reader", {"path": "/research/report.pdf"}, "Market study"),
    ("Capability without authority", "agent-intern", "crm_query", {"table": "customers"}, "Curiosity"),
    ("3-hop delegated read (restricted)", "agent-reporting", "crm_query", {"table": "customers"}, "Weekly report"),
    ("High-risk payment (human approval)", "agent-finance", "payment_transfer",
     {"account": "vendor-payouts", "recipient": "NW", "amount": 1250}, "Invoice INV-42"),
    ("Treasury transfer (explicit deny)", "agent-finance", "payment_transfer",
     {"account": "treasury", "recipient": "NW", "amount": 50000}, "Invoice"),
    ("Path traversal attempt", "agent-research", "file_reader", {"path": "/research/../hr/salaries.csv"}, "Research"),
]


def main() -> None:
    engine = create_database_engine("sqlite://")
    create_schema(engine)
    with make_session_factory(engine)() as session:
        tg = TrustGraph(session, tools=ToolRegistry(TicketAuthority("demo")))
        seed_world(tg)
        for title, agent, tool, arguments, purpose in WALKTHROUGH:
            result = tg.enforcer.execute(agent, tool, arguments, RequestContext(purpose=purpose))
            decision = result.decision
            risk = f"{decision.risk.score:.1f} {decision.risk.level.value}" if decision.risk else "—"
            print(f"\n■ {title}\n  {agent} → {tool}  status={result.status.value}  "
                  f"decision={decision.decision.value}  risk={risk}\n  {decision.reason}")
            if decision.authority_path:
                print(f"  authority: {' → '.join(decision.authority_path.principals)}")
        tg.commit()
        print(f"\nAudit chain: {tg.audit.verify().detail}")


if __name__ == "__main__":
    main()
