# Runtime Risk Model

The risk model is a **research prototype**. Its weights, factor values and thresholds are experimental parameters (proposal §8.9), not industry standards. `evaluation/` measures how decisions change as the thresholds change.

## Factors (each 0–100, always computed server-side)

| Factor | Source | Values |
|---|---|---|
| Action sensitivity | The action verb (`risk/action_sensitivity.py`) | list 10, read/search 15, execute 30, create 45, write 55, update 60, send 65, deploy 80, delete 90, transfer/admin 100, unknown 75 |
| Resource sensitivity | The registered resource (`risk/resource_sensitivity.py`) | `max(sensitivity, classification floor)`. Floors: public 0, internal 25, confidential 55, restricted 80. An unregistered resource scores 100. |
| Delegation risk | The authority path used (`risk/delegation_risk.py`) | direct 0, 1 hop 30, 2 hops 55, 3 hops 75, deeper 90 |
| Context risk | The request context (`risk/context_risk.py`) | No purpose +25. Untrusted content ingested this session: +60 if the action has side effects, otherwise +20. Injection-like phrases in the arguments +30. Capped at 100. |
| Behavioural risk | The audit log, over a 10-minute window (`risk/behavioural_risk.py`) | +20 per denied request; +2 per request above 30 in the window. Capped at 100. |

Clients cannot supply any factor. The gateway and dashboard only see the result.

## Combination

```
score = 0.30·action + 0.30·resource + 0.15·delegation + 0.15·context + 0.10·behaviour
      + 0.25 · (action · resource / 100)          ← interaction term
```

The interaction term reflects that a destructive action on a highly sensitive resource is riskier than an average of the two factors would suggest.

## Bands and decisions

| Score | Level | Default decision |
|---|---|---|
| < 35 | LOW | ALLOW |
| 35–59.99 | MEDIUM | RESTRICT (read: max 5 records, PII redacted; write: max 1 affected record) |
| 60–79.99 | HIGH | REQUIRE_APPROVAL |
| ≥ 80 | CRITICAL | DENY (cannot be overridden by approval) |

The final decision is the **most restrictive** of the policy outcome and the risk band. Policies can also set `max_risk_score`, which makes an allow policy inapplicable above that score.

## Worked examples (seed world)

| Request | Factors (a, r, d, c, b) | Score | Decision |
|---|---|---|---|
| Research agent reads the Q3 report (direct + delegated, with purpose) | 15, 30, 30, 0, 0 | ≈19 | ALLOW |
| Reporting agent reads customers via 3 hops | 15, 70, 75, 0, 0 | ≈39 | RESTRICT |
| Support agent deletes a customer (1 hop, with purpose) | 90, 70, 30, 0, 0 | 68.25 | REQUIRE_APPROVAL |
| Same deletion, no purpose, after reading untrusted content | 90, 70, 30, 85, 0 | 81 | DENY |
| Production deploy after ingesting untrusted content | 80, 90, 30, 60, 0 | 82.5 | DENY |

## Calibration and sensitivity

The defaults were chosen so that:
- low-consequence reads by directly or singly delegated agents run autonomously;
- delegation depth and sensitivity escalate the decision gradually;
- destructive or financial actions need a human;
- tainted contexts (indirect prompt injection) push consequential actions to DENY.

`evaluation/results/REPORT.md` reports accuracy, false-allow, false-deny and human-intervention rates for strict (25/50/70), default (35/60/80) and lenient (45/70/90) thresholds, plus an ablation with risk disabled (authority and policy only).
