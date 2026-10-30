# TRUSTGRAPH AI

**Risk-adaptive identity, delegation and runtime governance for autonomous AI agents.** This repository is an MSc Artificial Intelligence research prototype.

An AI agent should never be trusted simply because it has the technical ability to perform an action. TrustGraph sits between agents and the tools they use. For every action, it decides whether the agent has the identity, the delegated authority, the policy permission and an acceptable runtime risk to act at that moment. It then allows, restricts, escalates to a human, or denies the action, and records tamper-evident evidence of why.

```
Agent (LLM reasons, proposes)  ──►  TrustGraph engine (decides)  ──►  Protected tool (runs only with a signed ticket)
                                          │
              identity · capability · exact authority (via delegation chain) · policy · risk · approval · audit
```

## What is implemented

| Proposal objective | Where |
|---|---|
| Identity model for agents, users and authority relationships | `trustgraph/identity`: per-agent API keys, owners, lifecycle status |
| Constrained delegation without privilege amplification | `trustgraph/delegation`: exact-tuple grants, depth limits, cycle detection, expiry inheritance, cascading revocation, multi-hop reconstruction |
| Policy-based authorisation | `trustgraph/policy`: explicit-deny precedence, default deny, wildcard resources, conditions (purpose, risk ceiling, hop limit, direct-only, hours) |
| Runtime risk and adaptive enforcement | `trustgraph/risk`, `trustgraph/authorization`: five factors, interaction term, ALLOW / RESTRICT / REQUIRE_APPROVAL / DENY |
| Integrated prototype | Python engine + NestJS gateway + Next.js dashboard + PostgreSQL + Neo4j + LLM agent runtime |
| Experimental evaluation against static RBAC | `evaluation/`: 55 scenarios (proposal §12.2 A–H, plus revocation and bypass), metrics, latency, threshold sensitivity |

Further reading:
- [docs/architecture.md](docs/architecture.md): design artefacts (architecture, sequence, flowchart, class, ERD, data dictionary, graph model, deployment)
- [docs/risk-model.md](docs/risk-model.md)
- [docs/threat-model.md](docs/threat-model.md)
- [evaluation/results/REPORT.md](evaluation/results/REPORT.md): latest experimental results

## Architecture

| Component | Technology | Role |
|---|---|---|
| `trustgraph/` | Python 3.12, FastAPI, SQLAlchemy | **Authoritative** governance engine (port 8000) |
| `ai_agent/` | Gemini / OpenAI / Grok and deterministic planners | Agent runtime. Proposes tool calls; holds no tool implementations. |
| `graph/` | Neo4j | Non-authoritative projection for provenance queries |
| `backend/` | NestJS 11, TypeORM | Operator auth (JWT cookie), human RBAC, validation, OpenAPI, proxy (port 3001, `/api`) |
| `frontend/` | Next.js 15, React 19, Tailwind 4 | Governance dashboard (port 3000) |
| `evaluation/` | Python | Controlled experiment: TrustGraph vs. static RBAC |

## Quick start

### Full stack with Docker

```bash
cp .env.example .env          # set TRUSTGRAPH_SERVICE_TOKEN, TRUSTGRAPH_TICKET_SECRET, JWT_SECRET
docker compose up --build
```

- Dashboard: http://localhost:3000
- Gateway API docs: http://localhost:3001/docs
- Engine API docs: http://localhost:8000/docs
- Neo4j: http://localhost:7474

Demo operator accounts (development only; the password for all of them is `TrustGraph!2026`):

| Account | Role |
|---|---|
| `admin@trustgraph.local` | admin |
| `operator@trustgraph.local` | operator |
| `approver@trustgraph.local` | approver |
| `auditor@trustgraph.local` | auditor |

### Local development

```bash
# 1. Governance engine (SQLite by default; set TRUSTGRAPH_DATABASE_URL for PostgreSQL)
uv sync
TRUSTGRAPH_SERVICE_TOKEN=dev-service-token uv run uvicorn trustgraph.api:app --reload --port 8000

# 2. Gateway (needs PostgreSQL; see backend/.env.example)
cd backend && npm install && cp .env.example .env && npm run start:dev

# 3. Dashboard
cd frontend && npm install && npm run dev
```

No servers needed:

```bash
uv run python main.py                                   # console walkthrough of key scenarios
uv run python agent.py agent-research "Read /research/report.pdf and summarise it" --purpose "Market study"
uv run python -m evaluation --repetitions 30            # full experiment → evaluation/results/
```

## Tests

```bash
uv run pytest                 # 201 tests; the Neo4j tests skip unless a test instance is reachable
cd backend && npm test        # gateway: roles guard, auth service, engine client
cd frontend && npm run typecheck && npm run build
```

To run the Neo4j tests, start a disposable instance on port 7688:

```bash
docker run -d --name trustgraph-neo4j-test -p 7688:7687 -e NEO4J_AUTH=neo4j/trustgraph-test neo4j:5
```

To run the live LLM test, which calls Gemini, use `TRUSTGRAPH_LIVE_LLM_TESTS=1 uv run pytest tests/test_gemini_agent.py`.

## The experimental environment

The engine seeds a fictional organisation on first start (`trustgraph/seed.py`):
- 5 human principals
- 8 agents, including one suspended agent and one "intern" agent with broad technical capability but almost no authority
- 11 capabilities
- 19 protected resources, classified public, internal, confidential or restricted
- 16 policies
- 31 direct grants
- 7 delegations, including the 3-hop chain `u-bayo → agent-orchestrator → agent-finance → agent-reporting`

Tools act on an in-memory **synthetic sandbox**: files, CRM, mail outbox, payments ledger and deployments. Nothing touches real systems. The sandbox deliberately includes documents carrying indirect prompt-injection payloads.

## Latest results

From `evaluation/results/REPORT.md`: 55 scenarios, each in a freshly seeded isolated world.

| Metric | TrustGraph AI | Static RBAC baseline |
|---|---|---|
| Decision accuracy vs. ground truth | 100% | 36.4% |
| False-allow rate | 0% | 85.4% |
| False-deny rate | 0% | 0% |
| Privilege-escalation success | 0% | 100% |
| Legitimate task completion | 100% | 100% |
| Audit / provenance completeness | 100% / 100% | n/a |
| Decision latency p50 / p95 | 5.7 / 12.1 ms | < 0.01 ms |

Neo4j delegation-chain queries: p50 4.1 ms.

Interpret these with care. They show that the mechanisms behave as specified in a controlled environment, against a deliberately static baseline. They are not production security guarantees. The threshold-sensitivity analysis in the report shows the security/usability trade-off:
- strict thresholds cause false denials;
- lenient thresholds, or disabling risk scoring, let post-injection critical actions reach a human rather than being blocked.

## Repository notes

- The pre-rewrite prototype was archived to `../trustgraph-ai-legacy-backup-2026-10-13.tar.gz` before this implementation.
- Superseded files that could not be removed automatically now contain only a "superseded" marker and can be deleted:
  - backend: `src/governance/{governance.service,governance.controller,overview.controller,trustgraph-api.client,governance-evaluation.entity}.ts`
  - Python: `tests/tests/`
- Licence and data: all data is synthetic. Do not point the tools at real systems without replacing the sandbox and reviewing `docs/threat-model.md`.
# trustgraph-ai
