import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AuthorizationDecision, ExecutionResult, RiskThresholds } from '@/lib/types';
import { Badge, Code } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DescList, JsonView } from '@/components/ui/Page';
import { Alert } from '@/components/ui/States';
import { cx } from '@/components/ui/cx';
import { formatDate, ms } from '@/lib/format';
import { AuthorityPathView } from './AuthorityPathView';
import { DecisionBadge, StatusBadge, decisionTone } from './badges';
import { RiskBreakdown, RiskGauge } from './Risk';
import { TraceView } from './Trace';

const BANNER: Record<string, string> = {
  allow: 'border-allow-border bg-allow-bg',
  restrict: 'border-restrict-border bg-restrict-bg',
  approval: 'border-approval-border bg-approval-bg',
  deny: 'border-deny-border bg-deny-bg',
  neutral: 'border-line bg-surface-2',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Full rendering of an authorisation decision: verdict, risk, provenance, policies and trace. */
export function DecisionPanel({
  decision,
  thresholds,
  extra,
}: {
  decision: AuthorizationDecision;
  thresholds?: RiskThresholds;
  extra?: ReactNode;
}) {
  const tone = decisionTone(decision.decision);
  return (
    <div className="flex flex-col gap-4">
      <div className={cx('rounded-lg border p-4', BANNER[tone] ?? BANNER.neutral)} aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          <DecisionBadge decision={decision.decision} className="px-3 py-1 text-[13px]" />
          <span className="text-xs text-muted">
            {decision.capability || '—'} · {decision.resource || '—'} · {decision.action || '—'}
          </span>
        </div>
        <p className="mt-2 text-[15px] font-medium text-fg">{decision.reason}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
          <span>
            Request <Code>{decision.request_id}</Code>
          </span>
          {decision.on_behalf_of ? <span>On behalf of {decision.on_behalf_of}</span> : null}
          <span>Evaluated in {ms(decision.latency_ms)}</span>
          <span>{formatDate(decision.evaluated_at)}</span>
          {decision.approved_by ? <span>Approved by {decision.approved_by}</span> : null}
        </div>
        {decision.decision === 'require_approval' && decision.approval_id ? (
          <Link
            href={`/approvals?id=${encodeURIComponent(decision.approval_id)}`}
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-approval underline-offset-2 hover:underline"
          >
            Open approval {decision.approval_id} <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      {extra}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Runtime risk" description="Weighted factors (0–100) and their contribution to the score." />
          <CardBody className="flex flex-col gap-4">
            {decision.risk ? (
              <>
                <RiskGauge score={decision.risk.score} level={decision.risk.level} thresholds={thresholds} />
                <RiskBreakdown risk={decision.risk} />
              </>
            ) : (
              <p className="text-xs text-muted">Risk was not assessed (the request failed an earlier check).</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Decision trace" description="Each governance step, in evaluation order." />
          <CardBody>
            <TraceView trace={decision.trace} />
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Provenance & policy" />
        <CardBody className="flex flex-col gap-4">
          <Section title="Authority path">
            {decision.authority_path ? (
              <AuthorityPathView path={decision.authority_path} />
            ) : (
              <p className="text-xs text-muted">No authority path (authority not established).</p>
            )}
          </Section>
          <Section title="Matched policies">
            {decision.matched_policies.length ? (
              <div className="flex flex-wrap gap-1.5">
                {decision.matched_policies.map((policy) => (
                  <Badge key={policy} tone="neutral" mono>
                    {policy}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">None.</p>
            )}
          </Section>
          <Section title="Restrictions">
            {Object.keys(decision.restrictions).length ? (
              <DescList
                items={Object.entries(decision.restrictions).map(([key, value]) => [key, <Code key={key}>{JSON.stringify(value)}</Code>])}
              />
            ) : (
              <p className="text-xs text-muted">None applied.</p>
            )}
          </Section>
          <Section title="Fingerprint">
            <Code>{decision.fingerprint || '—'}</Code>
          </Section>
        </CardBody>
      </Card>
    </div>
  );
}

/** Governed execution result: execution status + tool output + full decision. */
export function ExecutionResultView({ result, thresholds }: { result: ExecutionResult; thresholds?: RiskThresholds }) {
  const executed = result.status === 'executed' || result.status === 'restricted';
  return (
    <DecisionPanel
      decision={result.decision}
      thresholds={thresholds}
      extra={
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Tool <Code>{result.tool_name}</Code> <StatusBadge status={result.status} />
              </span>
            }
            description={
              executed
                ? 'The enforcer issued a single-use ticket and the protected tool ran.'
                : 'The protected tool was not invoked.'
            }
          />
          <CardBody>
            {result.error ? (
              <Alert tone="error" title="Tool error">
                {result.error}
              </Alert>
            ) : executed ? (
              <JsonView value={result.output} />
            ) : (
              <p className="text-xs text-muted">No output — execution did not occur.</p>
            )}
          </CardBody>
        </Card>
      }
    />
  );
}
