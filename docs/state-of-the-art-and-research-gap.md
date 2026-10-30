# TrustGraph AI: State of the Art and Research Gap

**Status:** Preliminary evidence review, 22 September 2026

This document records the first state-of-the-art pass before further implementation. It is a research boundary document, not a claim that novelty has been established.

## Preliminary Finding

The broad claim that TrustGraph AI will combine identity, delegation, policy, runtime risk, auditability, and graph relationships is not sufficient as an MSc research contribution. Each major area already has relevant standards, guidance, or commercial and open-source implementations.

The defensible contribution should be a precisely defined and experimentally evaluated mechanism for **non-amplifying delegated authority under changing runtime risk**.

## What Existing Work Already Covers

### NIST

NIST AI RMF provides a voluntary lifecycle for governing, mapping, measuring, and managing AI risks. NIST SP 800-207 provides the zero-trust principle of continuously evaluating access to users, assets, and resources rather than trusting a static perimeter.

These establish the governance and continuous-verification motivation. They do not provide a complete agent-to-agent delegated-authority enforcement algorithm or an experimental comparison for autonomous-agent action decisions.

Sources:

- https://www.nist.gov/itl/ai-risk-management-framework
- https://csrc.nist.gov/pubs/sp/800/207/final
- https://csrc.nist.gov/pubs/ai/100/4/final

### IETF OAuth and Delegation

RFC 8693 already distinguishes delegation from impersonation. It defines token exchange concepts, subject and actor tokens, the `act` claim for the acting party, nested delegation history, and `may_act` for an authorized actor. It also discusses scope, lifetime, resource, audience, and delegation abuse.

RFC 9396 already supports fine-grained authorization requirements through `authorization_details`, including resources, actions, privileges, locations, identifiers, and context. It also requires authorization details to be made available to resource servers through tokens or introspection.

Therefore, TrustGraph must not claim that representing a delegation chain or resource/action constraints is itself novel.

Sources:

- https://www.rfc-editor.org/rfc/rfc8693
- https://www.rfc-editor.org/rfc/rfc9396
- https://www.rfc-editor.org/rfc/rfc9700

### OWASP

OWASP's 2025 guidance identifies excessive agency as a major LLM application risk. Its Agentic AI Threats and Mitigations guide provides a threat-model-based treatment of emerging agent risks. The OWASP Agent Control Standard, published in September 2026, explicitly targets inspectable, traceable, instrumentable agents and portable runtime middleware hooks for enforcing safety policies.

This means runtime interception, agent observability, tool controls, and policy hooks are already recognized design directions. TrustGraph's contribution must be narrower and tested against a specific unresolved mechanism rather than presented as the first runtime governance layer.

Sources:

- https://genai.owasp.org/llm-top-10/
- https://genai.owasp.org/agentic-ai-threats-and-mitigations/
- https://genai.owasp.org/resource/agent-control-standard-acs/
- https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/

## Candidate MSc Research Gap

### Proposed gap

Existing standards provide pieces for delegated identity, fine-grained authorization, zero-trust verification, runtime controls, and AI risk management. A focused research gap remains in evaluating a deterministic runtime decision mechanism that:

1. preserves the complete authority chain across human-to-agent and agent-to-agent delegation;
2. enforces a non-amplification invariant at every delegation step;
3. evaluates the requested resource and action against current contextual and behavioral risk;
4. returns allow, restrict, approval, or deny decisions;
5. produces evidence linking authority, policy, risk, decision, and execution outcome; and
6. is compared experimentally against a static RBAC baseline.

This is a candidate gap, not yet a proven literature gap. A systematic academic search must test it against prior research and existing systems.

### Formal invariant to investigate

For a delegation from principal `P` to agent `A`:

`EffectiveAuthority(A, context) <= DelegatedAuthority(P -> A)`

For a delegation chain `P -> A1 -> A2 -> ... -> An`, the final effective authority should be bounded by the intersection of all valid delegation constraints, not the union of capabilities accumulated across the chain.

### Candidate contribution

A risk-adaptive delegated-authority enforcement model and prototype whose main research claim is measurable security improvement under multi-agent delegation, subject to measured latency and false-denial costs.

The graph database is an implementation option for authority traceability, not the novelty claim. The LLM is an agent workload generator, not the research contribution.

## Revised Research Question

**How effectively can non-amplifying delegated-authority enforcement, combined with contextual runtime risk, reduce unauthorized and privilege-escalating actions by autonomous software agents compared with static RBAC while maintaining acceptable latency and legitimate task completion?**

### Supporting questions

1. Can a formal delegation constraint prevent authority amplification across multi-agent chains?
2. Does adding runtime risk change decisions usefully beyond static authority checks?
3. How much security and auditability improvement is obtained relative to the latency and intervention cost?
4. Which evidence fields are required to reconstruct the authority and decision chain after an event?

## Hypotheses

- **H1:** The proposed mechanism reduces unauthorized action success compared with static RBAC.
- **H2:** Non-amplifying chain validation reduces successful privilege escalation across multi-agent delegation chains.
- **H3:** Runtime risk adaptation detects more high-impact actions than static permission evaluation, with measurable false-denial trade-offs.
- **H4:** Evidence produced by the proposed mechanism provides more complete authority-chain reconstruction than the RBAC baseline.
- **H5:** The added decision latency remains within an explicitly defined prototype threshold.

## Baseline and Proposed System

### Baseline

A conventional static RBAC evaluator with agent roles mapped to permissions and no delegation-chain intersection, runtime behavioral risk, or approval state.

### Proposed system

A controlled multi-agent simulator using:

- explicit agent identities;
- human-to-agent and agent-to-agent delegation records;
- capability, resource, action, purpose, expiry, depth, and maximum-risk constraints;
- policy evaluation;
- deterministic risk scoring with documented weights and thresholds;
- allow, restrict, approval, and deny decisions;
- an execution boundary that blocks non-allow decisions;
- PostgreSQL audit records;
- an optional Neo4j projection for relationship visualization.

## Minimum Experimental Design

Use a synthetic enterprise environment with:

- 5 to 10 agents;
- 10 to 30 resources;
- 10 to 20 capabilities;
- 10 to 20 policies;
- delegation chains of depths 1 to 4;
- low, medium, high, and critical risk cases.

Run matched scenarios through both systems:

1. legitimate low-risk read;
2. capability present but resource outside scope;
3. action outside delegated authority;
4. delegation beyond parent authority;
5. multi-hop privilege escalation;
6. sensitive-resource request;
7. anomalous behavior increase;
8. prompt-injection-style instruction attempting policy bypass;
9. valid action requiring approval;
10. expired or revoked delegation.

Measure:

- unauthorized action success rate;
- privilege-escalation success rate;
- policy violation detection rate;
- false allow and false deny rates;
- approval rate and human intervention frequency;
- decision latency;
- graph and policy evaluation latency;
- audit-chain completeness;
- legitimate task completion rate.

Do not invent expected numerical results before running the experiments.

## Scope Recommendation

Keep the MSc project focused on runtime authorization of autonomous software agents in a controlled simulated enterprise environment. Do not claim to solve general AI safety, general LLM security, enterprise IAM replacement, or all agent governance.

Neo4j should be optional until the authority model and experiments are stable. PostgreSQL is sufficient for the authoritative audit and structured policy records; a graph projection can demonstrate relationship traversal without making graph storage the central novelty claim.

## Required Next Research Work

Before locking the title or claiming novelty:

1. Search ACM Digital Library, IEEE Xplore, SpringerLink, ScienceDirect, Scopus/Web of Science if available, arXiv, Google Scholar, patents, and GitHub.
2. Search combinations of: agent identity, delegated authorization, multi-agent access control, privilege amplification, risk-adaptive authorization, runtime governance, agent control plane, excessive agency, tool authorization, policy enforcement, accountability graph, and agent security.
3. Build a comparison matrix with columns for identity, delegation, chain constraints, risk adaptation, runtime interception, approval, audit evidence, graph model, and evaluation method.
4. Record inclusion and exclusion criteria, publication dates, search strings, and duplicate handling so the literature review is reproducible.
5. Rephrase the gap after the matrix, especially if an existing paper or product already evaluates the same non-amplification and risk-adaptive mechanism.

## Current Conclusion

TrustGraph AI remains a strong project direction, but the broad framework description is an architecture proposal, not yet a defensible novelty claim. The strongest current MSc formulation is a focused experimental study of **risk-adaptive, non-amplifying delegated authorization for autonomous agents**, with audit-chain completeness and latency as explicit evaluation targets.
