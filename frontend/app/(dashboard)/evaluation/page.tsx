'use client';

import { CheckCircle2, FlaskConical, Play, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PairedBars, type PairedDatum, SeriesLegend } from '@/components/charts/PairedBars';
import { DecisionBadge, StatusBadge } from '@/components/governance/badges';
import { Badge, Code } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { PageHeader, Stat } from '@/components/ui/Page';
import { Alert, EmptyState, ErrorState, LoadingBlock, MutationError } from '@/components/ui/States';
import { Table, TableWrap, Td, Th, THead } from '@/components/ui/Table';
import { cx } from '@/components/ui/cx';
import { ApiError, api } from '@/lib/api';
import { formatDate, ms, pct } from '@/lib/format';
import { useAsync, useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { CaseOutcome, EvaluationMetrics, EvaluationResult, ExpectedOutcome } from '@/lib/types';

const EXPECTED_TO_OUTCOME: Record<ExpectedOutcome, CaseOutcome> = {
  execute: 'executed',
  escalate: 'escalated',
  block: 'blocked',
};

type RateKey = Exclude<keyof EvaluationMetrics, 'cases' | 'latency_ms'>;

const METRICS: { key: RateKey; label: string; lowerIsBetter?: boolean }[] = [
  { key: 'accuracy', label: 'Decision accuracy' },
  { key: 'false_allow_rate', label: 'False-allow rate', lowerIsBetter: true },
  { key: 'false_deny_rate', label: 'False-deny rate', lowerIsBetter: true },
  { key: 'unauthorised_action_prevention_rate', label: 'Unauthorised action prevention' },
  { key: 'unauthorised_delegation_prevention_rate', label: 'Unauthorised delegation prevention' },
  { key: 'excessive_agency_prevention_rate', label: 'Excessive agency prevention' },
  { key: 'privilege_escalation_success_rate', label: 'Privilege escalation success', lowerIsBetter: true },
  { key: 'legitimate_task_completion', label: 'Legitimate task completion' },
  { key: 'human_intervention_rate', label: 'Human intervention rate', lowerIsBetter: true },
  { key: 'audit_completeness', label: 'Audit completeness' },
  { key: 'provenance_completeness', label: 'Provenance completeness' },
];

function Elapsed({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return running ? <span className="text-xs text-muted tabular-nums">{seconds}s elapsed — this can take up to a minute</span> : null;
}

function OutcomeCell({ outcome, expected, reason, decision }: { outcome: CaseOutcome; expected: ExpectedOutcome; reason: string | null; decision: string | null }) {
  const correct = EXPECTED_TO_OUTCOME[expected] === outcome;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {correct ? (
          <CheckCircle2 className="size-3.5 text-allow" aria-label="Correct" />
        ) : (
          <XCircle className="size-3.5 text-deny" aria-label="Mismatch" />
        )}
        <StatusBadge status={outcome} />
        {decision ? <DecisionBadge decision={decision} /> : null}
      </div>
      {reason ? <p className="max-w-xs text-[11px] text-muted">{reason}</p> : null}
    </div>
  );
}

function Results({ result }: { result: EvaluationResult }) {
  const tg = result.summary.trustgraph;
  const base = result.summary.baseline_rbac;
  const [category, setCategory] = useState('');
  const [mismatchOnly, setMismatchOnly] = useState(false);

  const metricData: PairedDatum[] = METRICS.map((metric) => ({
    label: metric.label,
    note: metric.lowerIsBetter ? 'lower is better' : undefined,
    a: tg[metric.key],
    b: base[metric.key],
  }));
  const categoryData: PairedDatum[] = result.categories.map((item) => ({
    label: `${item.id}. ${item.name}`,
    note: `${item.cases} cases · ${item.trustgraph.correct} vs ${item.baseline_rbac.correct} correct`,
    a: item.trustgraph.accuracy,
    b: item.baseline_rbac.accuracy,
  }));

  const cases = useMemo(
    () =>
      result.cases.filter((item) => {
        if (category && item.category !== category) return false;
        if (!mismatchOnly) return true;
        const expected = EXPECTED_TO_OUTCOME[item.expected];
        return item.trustgraph.outcome !== expected || item.baseline_rbac.outcome !== expected;
      }),
    [result.cases, category, mismatchOnly],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="TrustGraph accuracy" value={pct(tg.accuracy)} hint={`Baseline RBAC ${pct(base.accuracy)}`} tone="good" />
        <Stat label="False-allow rate" value={pct(tg.false_allow_rate)} hint={`Baseline RBAC ${pct(base.false_allow_rate)}`} />
        <Stat label="Escalation success" value={pct(tg.privilege_escalation_success_rate)} hint={`Baseline RBAC ${pct(base.privilege_escalation_success_rate)}`} />
        <Stat label="Decision latency p95" value={ms(tg.latency_ms?.p95)} hint={`p50 ${ms(tg.latency_ms?.p50)} · baseline p95 ${ms(base.latency_ms?.p95)}`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Security & utility metrics" description={`${tg.cases} evaluated cases per system.`} actions={<SeriesLegend />} />
          <CardBody>
            <PairedBars data={metricData} caption="TrustGraph versus baseline RBAC on security and utility metrics" />
          </CardBody>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Accuracy by scenario category" actions={<SeriesLegend />} />
            <CardBody>
              <PairedBars data={categoryData} caption="Accuracy per scenario category" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Decision latency" description="Per-request governance overhead." />
            <TableWrap>
              <Table>
                <caption className="sr-only">Latency</caption>
                <THead>
                  <tr>
                    <Th>System</Th>
                    <Th className="text-right">Mean</Th>
                    <Th className="text-right">p50</Th>
                    <Th className="text-right">p95</Th>
                    <Th className="text-right">p99</Th>
                  </tr>
                </THead>
                <tbody>
                  {([['TrustGraph', tg], ['Baseline RBAC', base]] as const).map(([name, metrics]) => (
                    <tr key={name}>
                      <Td className="font-medium">{name}</Td>
                      <Td className="text-right tabular-nums">{ms(metrics.latency_ms?.mean)}</Td>
                      <Td className="text-right tabular-nums">{ms(metrics.latency_ms?.p50)}</Td>
                      <Td className="text-right tabular-nums">{ms(metrics.latency_ms?.p95)}</Td>
                      <Td className="text-right tabular-nums">{ms(metrics.latency_ms?.p99)}</Td>
                    </tr>
                  ))}
                  <tr>
                    <Td className="font-medium">Neo4j chain query</Td>
                    {result.graph.chain_query_latency_ms ? (
                      <>
                        <Td className="text-right tabular-nums">{ms(result.graph.chain_query_latency_ms.mean)}</Td>
                        <Td className="text-right tabular-nums">{ms(result.graph.chain_query_latency_ms.p50)}</Td>
                        <Td className="text-right tabular-nums">{ms(result.graph.chain_query_latency_ms.p95)}</Td>
                        <Td className="text-right tabular-nums">{ms(result.graph.chain_query_latency_ms.p99)}</Td>
                      </>
                    ) : (
                      <Td colSpan={4} className="text-right text-xs text-muted">
                        {result.graph.neo4j_available ? 'not measured' : 'Neo4j unavailable during this run'}
                      </Td>
                    )}
                  </tr>
                </tbody>
              </Table>
            </TableWrap>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Full metric table" />
        <TableWrap>
          <Table>
            <caption className="sr-only">All metrics</caption>
            <THead>
              <tr>
                <Th>Metric</Th>
                <Th className="text-right">TrustGraph</Th>
                <Th className="text-right">Baseline RBAC</Th>
                <Th className="text-right">Δ (pp)</Th>
              </tr>
            </THead>
            <tbody>
              {METRICS.map((metric) => {
                const a = tg[metric.key];
                const b = base[metric.key];
                const delta = a !== null && b !== null ? (a - b) * 100 : null;
                const better = delta === null || delta === 0 ? null : metric.lowerIsBetter ? delta < 0 : delta > 0;
                return (
                  <tr key={metric.key}>
                    <Td>
                      {metric.label}
                      {metric.lowerIsBetter ? <span className="ml-1 text-[11px] text-muted">(lower is better)</span> : null}
                    </Td>
                    <Td className="text-right tabular-nums">{pct(a)}</Td>
                    <Td className="text-right tabular-nums">{pct(b)}</Td>
                    <Td className={cx('text-right tabular-nums', better === true && 'text-allow', better === false && 'text-deny')}>
                      {delta === null ? 'n/a' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}
                      {better === true ? ' ▲' : better === false ? ' ▼' : ''}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card>
        <CardHeader title="Sensitivity analysis" description="TrustGraph behaviour under alternative risk thresholds." />
        {result.sensitivity.length ? (
          <TableWrap>
            <Table>
              <caption className="sr-only">Sensitivity analysis</caption>
              <THead>
                <tr>
                  <Th>Configuration</Th>
                  <Th className="text-right">Medium / high / critical</Th>
                  <Th className="text-right">Accuracy</Th>
                  <Th className="text-right">False allow</Th>
                  <Th className="text-right">False deny</Th>
                  <Th className="text-right">Human intervention</Th>
                </tr>
              </THead>
              <tbody>
                {result.sensitivity.map((row) => (
                  <tr key={row.label}>
                    <Td className="font-medium">{row.label}</Td>
                    <Td className="text-right tabular-nums">
                      {row.thresholds.medium} / {row.thresholds.high} / {row.thresholds.critical}
                    </Td>
                    <Td className="text-right tabular-nums">{pct(row.accuracy)}</Td>
                    <Td className="text-right tabular-nums">{pct(row.false_allow_rate)}</Td>
                    <Td className="text-right tabular-nums">{pct(row.false_deny_rate)}</Td>
                    <Td className="text-right tabular-nums">{pct(row.human_intervention_rate)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        ) : (
          <EmptyState title="No sensitivity runs in this result" />
        )}
      </Card>

      <Card>
        <CardHeader
          title="Cases"
          description="Expected outcome versus each system's outcome. Rows with a mismatch are highlighted."
          actions={
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Category" className="w-56">
                {(id) => (
                  <Select id={id} value={category} onChange={(event) => setCategory(event.target.value)}>
                    <option value="">All categories</option>
                    {result.categories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id}. {item.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Checkbox label="Mismatches only" checked={mismatchOnly} onChange={(event) => setMismatchOnly(event.target.checked)} />
            </div>
          }
        />
        <TableWrap>
          <Table>
            <caption className="sr-only">Evaluation cases</caption>
            <THead>
              <tr>
                <Th>Case</Th>
                <Th>Expected</Th>
                <Th>TrustGraph</Th>
                <Th>Baseline RBAC</Th>
              </tr>
            </THead>
            <tbody>
              {cases.map((item) => {
                const expected = EXPECTED_TO_OUTCOME[item.expected];
                const tgWrong = item.trustgraph.outcome !== expected;
                const baseWrong = item.baseline_rbac.outcome !== expected;
                return (
                  <tr key={item.id} className={cx(tgWrong && 'bg-deny-bg/60', !tgWrong && baseWrong && 'bg-restrict-bg/40')}>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Code>{item.id}</Code>
                        <Badge>{item.category}</Badge>
                      </div>
                      <p className="mt-1 max-w-sm text-xs">{item.description}</p>
                    </Td>
                    <Td>
                      <StatusBadge status={expected} />
                    </Td>
                    <Td>
                      <OutcomeCell outcome={item.trustgraph.outcome} expected={item.expected} reason={item.trustgraph.reason} decision={item.trustgraph.decision} />
                    </Td>
                    <Td>
                      <OutcomeCell outcome={item.baseline_rbac.outcome} expected={item.expected} reason={item.baseline_rbac.reason} decision={item.baseline_rbac.decision} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
        {cases.length === 0 ? <EmptyState title="No cases match" /> : null}
      </Card>
    </div>
  );
}

export default function EvaluationPage() {
  const { can } = useSession();
  const latest = useAsync(() => api.latestEvaluation(), []);
  const [repetitions, setRepetitions] = useState(20);
  const run = useMutation(api.runEvaluation);
  const result = latest.data;
  const noResult = latest.error instanceof ApiError && latest.error.status === 404;

  return (
    <>
      <PageHeader
        title="Evaluation"
        icon={<FlaskConical className="size-5" />}
        description="Controlled experiment comparing TrustGraph with a role-based access control baseline over identical scenarios (isolated in-memory environment)."
        actions={
          can('evaluation.run') ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Repetitions" className="w-28">
                {(id) => <Input id={id} type="number" min={1} max={500} value={repetitions} onChange={(event) => setRepetitions(Math.max(1, Number(event.target.value) || 1))} />}
              </Field>
              <Button
                variant="primary"
                loading={run.pending}
                icon={<Play className="size-4" />}
                onClick={async () => {
                  const fresh = await run.run(repetitions);
                  if (fresh) latest.setData(fresh);
                }}
              >
                Run experiment
              </Button>
            </div>
          ) : null
        }
      />
      <div className="flex flex-col gap-4">
        <Elapsed running={run.pending} />
        <MutationError error={run.error} />
        {result ? (
          <Alert tone="info">
            Run <Code>{result.run_id}</Code> · {formatDate(result.generated_at)} · {result.repetitions} repetitions · environment of{' '}
            {result.environment.agents} agents, {result.environment.users} users, {result.environment.resources} resources,{' '}
            {result.environment.policies} policies, {result.environment.delegations} delegations.
          </Alert>
        ) : null}
        {result ? (
          <Results result={result} />
        ) : noResult ? (
          <Card>
            <EmptyState
              icon={<FlaskConical className="size-7" />}
              title="No evaluation has been run yet"
              description={can('evaluation.run') ? 'Run the experiment to generate results.' : 'An operator can run the experiment.'}
            />
          </Card>
        ) : latest.error ? (
          <Card>
            <ErrorState error={latest.error} onRetry={latest.reload} />
          </Card>
        ) : (
          <LoadingBlock rows={10} />
        )}
      </div>
    </>
  );
}
