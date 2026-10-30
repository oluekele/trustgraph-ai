# TrustGraph AI — Architecture and Design Artefacts

This document holds the design models listed in proposal §18. Diagrams are Mermaid, so they render on GitHub and in most Markdown viewers. You can export them to images for the dissertation.

## 1. System architecture (layered)

```mermaid
flowchart TB
    UI["Next.js / React dashboard<br/>(operators: admin · operator · approver · auditor)"]
    GW["NestJS gateway  /api<br/>operator auth (JWT cookie) · RBAC for humans<br/>validation · OpenAPI · operator accounts"]
    subgraph PY["TrustGraph governance engine (Python / FastAPI) — authoritative"]
        ID[Identity] --> CAP[Capability & resource catalogue]
        CAP --> AUTH[Authority reconstruction]
        AUTH --> DEL[Delegation engine]
        DEL --> POL[Policy engine]
        POL --> RISK[Risk engine]
        RISK --> DEC[Authorisation engine]
        DEC --> ENF[Runtime enforcer]
        DEC --> APR[Human approval]
        ENF --> AUD[Hash-chained audit]
    end
    AG["AI agent runtime<br/>(Gemini / OpenAI / Grok / scripted planners)"]
    TOOLS["Protected tools<br/>(ticket-gated, synthetic sandbox)"]
    PG[(PostgreSQL<br/>authoritative store)]
    NEO[(Neo4j<br/>graph projection)]

    UI -- HTTPS + cookie --> GW
    GW -- "X-Service-Token, X-Operator-Id" --> PY
    AG -- "proposes tool calls" --> ENF
    ENF -- "signed single-use ticket" --> TOOLS
    PY --> PG
    PY -. "async projection (non-authoritative)" .-> NEO
```

Responsibilities:

| Layer | Owns | Never does |
|---|---|---|
| Python engine | Every authorisation decision, delegation validation, risk, approvals, audit, tool enforcement | Trust its callers for identity: agents present API keys and the gateway presents the service token |
| NestJS gateway | Human operator identity, roles, sessions, login audit, request validation, proxying | Make or alter governance decisions |
| Dashboard | Presentation, operator workflows | Hold secrets or call Python directly |
| Agent planner (LLM) | Reasoning and proposing actions | Authorise itself or hold tool implementations |
| Neo4j | Relationship and provenance queries | Act as a source of truth (it is rebuilt from PostgreSQL) |

## 2. Runtime authorisation sequence

```mermaid
sequenceDiagram
    autonumber
    participant P as Planner (LLM)
    participant R as Agent runtime
    participant E as RuntimeEnforcer
    participant A as AuthorizationEngine
    participant D as Authority reconstructor
    participant K as Risk engine
    participant Q as Policy engine
    participant L as Audit log
    participant T as ProtectedTool
    P->>R: tool call (name, args)
    R->>E: execute(agent, tool, args, context)
    E->>A: AuthorizationRequest(capability, resource, action)
    A->>A: canonicalise resource, verify identity & credential
    A->>D: reconstruct effective authority
    D-->>A: authority paths (root grant → delegations)
    A->>K: factors(action, resource, path, context, behaviour)
    K-->>A: score, level
    A->>Q: evaluate(request, path, risk)
    Q-->>A: deny / approval / allow / default-deny
    A->>L: authorization event (trace, risk, chain)
    A-->>E: decision
    alt ALLOW or RESTRICT
        E->>T: invoke(signed single-use ticket, restrictions)
        T-->>E: output
    else REQUIRE_APPROVAL
        E-->>R: pending + approval_id (nothing executes)
    else DENY
        E-->>R: blocked + reason
    end
    E->>L: execution event (status)
    R-->>P: observation (decision, reason, output)
```

## 3. Delegation and approval sequences

```mermaid
sequenceDiagram
    participant X as Delegator
    participant C as DelegationChainEngine
    participant D as Reconstructor
    participant V as DelegationValidator
    X->>C: DelegationRequest(grants, depth, expiry)
    C->>D: delegator's effective authority (now)
    C->>V: validate(identity, capability, exact grant, depth, cycle, expiry)
    alt violations
        V-->>C: violations
        C-->>X: rejected (audited as delegation.rejected)
    else valid
        C-->>X: delegation (depth, parent, inherited expiry) — audited
    end
```

```mermaid
sequenceDiagram
    participant Ag as Agent
    participant E as Enforcer/Engine
    participant H as Human approver (dashboard)
    Ag->>E: high-risk action
    E-->>Ag: REQUIRE_APPROVAL (approval bound to SHA-256 fingerprint)
    H->>E: approve(approval_id)  — must be a human, not the requesting agent
    Ag->>E: same action + approval_id
    E->>E: full re-evaluation (authority, policy, risk)
    E-->>Ag: ALLOW (approval consumed; replay or altered arguments → new approval)
```

## 4. Authorisation decision flowchart

```mermaid
flowchart TD
    S([Request]) --> C0{Resource URI valid?}
    C0 -- no --> DENY
    C0 -- yes --> C1{Credential matches agent?<br/>agent registered & active?}
    C1 -- no --> DENY
    C1 -- yes --> C2{Agent has technical capability?}
    C2 -- no --> DENY
    C2 -- yes --> C3{Resource registered and<br/>action defined?}
    C3 -- no --> DENY
    C3 -- yes --> C4{Exact grant held via a<br/>currently valid path?}
    C4 -- no --> DENY
    C4 -- yes --> R[Assess runtime risk]
    R --> P{Policy}
    P -- explicit deny / none applicable --> DENY
    P -- allow / approval --> M[Most restrictive of<br/>policy and risk band]
    M -- critical --> DENY
    M -- high or approval policy --> AP{Valid approval presented?}
    AP -- rejected --> DENY
    AP -- no --> RA([REQUIRE_APPROVAL])
    AP -- yes --> AL([ALLOW])
    M -- medium --> RS([RESTRICT])
    M -- low --> AL
    DENY([DENY])
```

## 5. Class diagram (core)

```mermaid
classDiagram
    class Principal { id; kind; name; owner_id; status; capabilities[] }
    class Capability { name; actions[] }
    class Resource { id; classification; sensitivity; allowed_actions[] }
    class Permission { capability; resource; action }
    class AuthorityGrant { id; principal_id; max_delegation_depth; expires_at; revoked_at }
    class Delegation { id; delegator_id; delegatee_id; grants[]; max_redelegation_depth; depth; status; expires_at }
    class AuthorityPath { permission; root_grant_id; chain[]; principals[]; remaining_depth }
    class EffectiveAuthority { principal_id; paths[]; best_path(); best_delegable_path() }
    class EffectiveAuthorityReconstructor { reconstruct(principal) }
    class DelegationValidator { validate(request, ...) }
    class DelegationChainEngine { create_delegation(); revoke_delegation(); cascade() }
    class Policy { effect; priority; subjects; capabilities; resources; actions; conditions }
    class PolicyEngine { evaluate(request, path, risk) }
    class RiskEngine { assess(factors) }
    class AuthorizationEngine { evaluate(request) }
    class RuntimeEnforcer { execute(agent, tool, args, context) }
    class ApprovalService { request(); decide(); check(); consume() }
    class AuditLogger { record(); verify() }
    class ProtectedTool { invoke(ticket, ...) }
    class GraphStore { sync(snapshot); delegation_chains(); blast_radius() }

    AuthorityGrant --> Permission
    Delegation "1" --> "*" Permission
    AuthorityPath --> Permission
    EffectiveAuthority "1" --> "*" AuthorityPath
    EffectiveAuthorityReconstructor ..> EffectiveAuthority
    DelegationChainEngine --> DelegationValidator
    DelegationChainEngine --> EffectiveAuthorityReconstructor
    AuthorizationEngine --> EffectiveAuthorityReconstructor
    AuthorizationEngine --> PolicyEngine
    AuthorizationEngine --> RiskEngine
    AuthorizationEngine --> ApprovalService
    AuthorizationEngine --> AuditLogger
    RuntimeEnforcer --> AuthorizationEngine
    RuntimeEnforcer --> ProtectedTool
```

## 6. Entity–relationship diagram (PostgreSQL)

```mermaid
erDiagram
    principals ||--o{ principals : "owner_id / parent_agent_id"
    principals ||--o{ authority_grants : holds
    capabilities ||--o{ authority_grants : "capability"
    resources ||--o{ authority_grants : "resource"
    principals ||--o{ delegations : "delegator_id"
    principals ||--o{ delegations : "delegatee_id"
    delegations ||--o{ delegations : "parent_delegation_id"
    principals ||--o{ approvals : "agent_id"
    principals {
        varchar id PK
        varchar kind
        varchar name
        varchar owner_id FK
        varchar parent_agent_id FK
        varchar status
        json capabilities
        varchar api_key_hash UK
        timestamptz created_at
    }
    capabilities { varchar name PK
        json actions }
    resources { varchar id PK
        varchar classification
        float sensitivity
        json allowed_actions }
    authority_grants { varchar id PK
        varchar principal_id FK
        varchar capability FK
        varchar resource FK
        varchar action
        int max_delegation_depth
        timestamptz expires_at
        timestamptz revoked_at }
    delegations { varchar id PK
        varchar delegator_id FK
        varchar delegatee_id FK
        json grants
        int max_redelegation_depth
        int depth
        varchar status
        timestamptz expires_at }
    policies { varchar id PK
        varchar effect
        int priority
        json subjects
        json resources
        json conditions
        int version }
    approvals { varchar id PK
        varchar fingerprint
        varchar agent_id FK
        varchar status
        timestamptz expires_at
        varchar decided_by }
    audit_events { varchar id PK
        int sequence UK
        varchar event_type
        varchar actor_id
        json delegation_chain
        varchar decision
        float risk_score
        varchar prev_hash
        varchar hash }
    operators { uuid id PK
        varchar email UK
        varchar role
        varchar password_hash }
    login_events { uuid id PK
        varchar email
        boolean success }
```

`operators` and `login_events` are owned by the NestJS gateway (TypeORM migration). Every other table belongs to the Python engine (`trustgraph/persistence/tables.py`).

### Data dictionary (key fields)

| Table.field | Meaning |
|---|---|
| `principals.capabilities` | The technical capabilities (tools) an agent can drive. This is **not** authority. |
| `authority_grants.max_delegation_depth` | How many delegation hops this root authority may travel. `0` means usable but not delegable. |
| `delegations.grants` | The exact `(capability, resource, action)` tuples delegated. |
| `delegations.max_redelegation_depth` | The onward hops the delegatee may use. The effective value is `min(upstream − 1, requested)`. |
| `delegations.depth` | The position in the chain: `1` means delegated directly from the root grant holder. |
| `approvals.fingerprint` | The SHA-256 of agent, capability, resource, action, arguments and purpose. It binds the approval to one exact action. |
| `audit_events.prev_hash` / `hash` | The hash chain: `hash = sha256(prev_hash ‖ canonical_json(event))`. |
| `audit_events.principal_chain` | Root human → … → acting agent, for provenance. |

## 7. Neo4j graph model

Nodes, all labelled `:TG`: `User`, `Agent`, `Capability`, `Resource`, `AuthorityGrant`, `Delegation`.

Relationships:
- `OWNS`
- `HAS_CAPABILITY`
- `HOLDS` (principal → grant)
- `TARGETS` (grant → resource)
- `FROM` (delegator → delegation)
- `DELEGATED_TO` (delegation → delegatee)
- `GRANTS` (delegation → resource)
- `EXECUTED` / `BLOCKED` (agent → resource, from recent activity)

`FROM`/`DELEGATED_TO` edges carry `status`, so active-chain queries skip revoked or expired links:

```cypher
MATCH path = (root:User)-[:FROM|DELEGATED_TO*2..20]->(agent:Agent {id: $agent_id})
WHERE all(r IN relationships(path) WHERE r.status = 'active')
RETURN path
```

The projection is rebuilt asynchronously after every successful mutating request. Authorisation never reads from Neo4j.

## 8. Deployment

```mermaid
flowchart LR
    B[Browser] -->|3000| FE[frontend container<br/>Next.js standalone]
    B -->|3001 /api| BE[backend container<br/>NestJS]
    BE -->|8000| API[trustgraph-api container<br/>FastAPI + uvicorn]
    API --> PG[(postgres:16)]
    BE --> PG
    API -.-> NEO[(neo4j:5)]
```

All ports bind to `127.0.0.1` in `docker-compose.yml`. Put a TLS-terminating reverse proxy in front of the stack before exposing it beyond localhost.

## 9. Module map (proposal §19 → code)

| Proposal module | Code |
|---|---|
| Identity | `trustgraph/identity/` (`models.py`, `store.py`: registration, API keys, status) |
| Capability | `trustgraph/capability/` (catalogue, resource canonicalisation) |
| Authority | `trustgraph/delegation/{provenance,authority,direct_authority,reconstructor}.py` |
| Delegation | `trustgraph/delegation/{models,engine,chain}.py` |
| Authorization | `trustgraph/authorization/engine.py` |
| Policy | `trustgraph/policy/` |
| Risk | `trustgraph/risk/` (one analyser per factor, plus `engine.py`) |
| Runtime | `trustgraph/authorization/runtime.py`, `ai_agent/runtime.py`, `ai_agent/tools/` |
| Audit | `trustgraph/audit/` |
| Graph | `graph/client.py`, `graph/store.py` |
| Approval | `trustgraph/approval/` |
| Backend | `backend/` (NestJS) |
| Frontend | `frontend/` (Next.js) |
| Baseline and evaluation | `trustgraph/baseline/rbac.py`, `evaluation/` |
