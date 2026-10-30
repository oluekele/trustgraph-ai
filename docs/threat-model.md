# Threat Model and Security Controls

Scope: runtime governance of software-agent actions in a controlled environment (proposal §5, §20). Each threat is mapped to the control that addresses it, the code that implements it, and the evidence that it works (tests and evaluation scenarios).

| # | Threat (proposal §20) | Control | Implementation | Evidence |
|---|---|---|---|---|
| 20.1 | Privilege escalation: an agent acts beyond its authority | Exact-tuple effective-authority check; capability ≠ authority | `authorization/engine.py` step 4, `delegation/reconstructor.py` | `test_atomic_authority_grants.py`; scenarios B1–B6 |
| 20.2 | Unauthorised delegation | The delegator must hold the exact grant via a delegable path | `delegation/engine.py` | `test_delegation_privilege_amplification.py`; scenarios C1–C5, D1–D4 |
| 20.3 | Delegation-chain abuse: gradual expansion | Remaining depth shrinks per hop (`min(upstream−1, requested)`); cycle detection; expiry inheritance; policy hop limits | `delegation/engine.py`, `reconstructor.py`, `policy/engine.py` | `test_multihop_*`, `test_delegation_chain.py`; scenarios E2–E4 |
| 20.4 | Excessive agency | Risk scoring with restriction, approval or denial; behavioural risk on repeated denials and bursts | `risk/`, `authorization/engine.py` | `test_runtime_risk_decisions.py`; scenarios F1–F3, G1–G3 |
| 20.5 | Tool abuse: a legitimate tool on an illegitimate target | Resource derived from the arguments, canonicalised, and checked as an exact tuple | `ai_agent/tools/definitions.py`, `capability/catalog.py` | `test_exact_tuple_security.py` (path traversal); B6 |
| 20.6 | Credential misuse or impersonation | Per-agent API keys stored as hashes; the authenticated principal must equal the claimed agent | `identity/store.py`, `routes/runtime.py` | `test_api.py`, `test_authorization.py`; S1 |
| 20.7 | Prompt injection: direct or indirect | Authorisation sits outside the agent's reasoning; taint tracking raises context risk after untrusted content; injection markers are detected | `ai_agent/runtime.py`, `risk/context_risk.py` | `test_agent_runtime.py`; H1–H4 |
| 20.8 | Policy bypass: calling tools directly | Tools run only with an HMAC-signed, single-use ticket bound to request, tool and fingerprint; failures fail closed | `ai_agent/tools/registry.py`, `authorization/runtime.py` | `test_runtime_enforcement.py`; S2 |
| — | Stale authority after revocation, expiry or suspension | Authority is reconstructed on every request; revocation also cascades through the delegation register | `reconstructor.py`, `delegation/chain.py` | `test_cascading_revocation.py`, `test_effective_authority_reconstruction.py`; R1–R6 |
| — | Approval abuse: replay, substitution, self-approval | Approval bound to the fingerprint, single-use, with a TTL; must be a human who is not the requester; full re-evaluation | `approval/service.py` | `test_runtime_authorization.py`; F4–F6 |
| — | Audit tampering | Hash-chained, sequence-numbered events; `verify()` detects edits and deletions | `audit/logger.py` | `test_audit_logger.py` |
| — | Gateway compromise or spoofed operator | Service token between gateway and engine; operator identity is attributed in the audit log; human RBAC at the gateway | `routes/deps.py`, `backend/src/auth` | `test_api.py`, backend tests |

## Trust boundaries

1. **Browser → gateway.** The operator logs in. The JWT sits in an `HttpOnly` `SameSite=Lax` cookie. Roles are enforced per route. Logins are rate-limited.
2. **Gateway → engine.** The shared service token is compared in constant time, and the operator id is forwarded for attribution. The engine treats the gateway as an operator, never as an agent.
3. **Agent → engine.** Agents authenticate with their own API key. The engine derives the resource, the action and all risk factors itself; nothing security-relevant is taken from the agent at face value.
4. **Engine → tool.** Only the enforcer can mint tickets. Tools hold no authority logic and simply refuse calls without a ticket.

## Known limitations (to discuss in the dissertation)

- The in-process ticket mechanism demonstrates the pattern. In production, tools would be separate services that verify tickets (for example signed JWTs with audience and expiry).
- The prompt-injection detector is pattern-based. The real defence is that authority does not depend on the model's reasoning; detection only raises risk.
- The engine's tables are created with SQLAlchemy `create_all`. Production needs managed migrations (for example Alembic).
- Agent API keys for the demo world are exposed through `/admin/seed-keys`, which the gateway restricts to admins. Disable this outside demonstrations.
- Effective authority is recomputed per request with a small number of queries per principal on the chain (about 6–9 ms on SQLite in the experiments). Very large delegation graphs would need caching with invalidation events.
