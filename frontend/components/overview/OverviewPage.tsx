'use client';

import {
  Activity,
  Bot,
  Database,
  FileCheck2,
  GitFork,
  Network,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Boxes,
} from 'lucide-react';
import Link from 'next/link';
import { DecisionBadge, RiskBadge } from '@/components/governance/badges';
import { PrincipalChain } from '@/components/governance/AuthorityPathView';
import { Badge, Code } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader, Stat } from '@/components/ui/Page';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { type AsyncState, useAsync } from '@/lib/hooks';
import type { AuditVerification, Decision, Overview } from '@/lib/types';

const DECISION_ORDER: Decision[] = ['allow', 'restrict', 'require_approval', 'deny'];
const DECISION_FILL: Record<Decision, string> = {
  allow: 'var(--allow)',
  restrict: 'var(--restrict)',
  require_approval: 'var(--approval)',
  deny: 'var(--deny)',
};

function DecisionDistribution({ decisions }: { decisions: Overview['decisions'] }) {
  const total = DECISION_ORDER.reduce((sum, key) => sum + (decisions[key] ?? 0), 0);
  if (!total) {
    return (
      <EmptyState
        title="No authorisation decisions yet"
        description="Run a simulation in the playground or an agent task to populate this view."
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" aria-hidden>
        {DECISION_ORDER.filter((key) => decisions[key]).map((key) => (
          <div
            key={key}
            style={{ width: `${(decisions[key] / total) * 100}%`, background: DECISION_FILL[key] }}
            title={`${key}: ${decisions[key]}`}
          />
        ))}
      </div>
      <table className="w-full text-[13px]">
        <caption className="sr-only">Decision distribution</caption>
        <tbody>
          {DECISION_ORDER.map((key) => {
            const count = decisions[key] ?? 0;
            const share = count / total;
            return (
              <tr key={key}>
                <th scope="row" className="w-40 py-1.5 text-left font-normal">
                  <DecisionBadge decision={key} />
                </th>
                <td className="py-1.5">
                  <div className="h-2 rounded-full bg-surface-3">
                    <div className="h-2 rounded-full" style={{ width: `${share * 100}%`, background: DECISION_FILL[key] }} />
                  </div>
                </td>
                <td className="w-24 py-1.5 text-right tabular-nums">
                  {count} <span className="text-muted">({(share * 100).toFixed(0)}%)</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IntegrityBadge({ verify }: { verify: AsyncState<AuditVerification> }) {
  if (verify.loading) return <Skeleton className="h-5 w-32" />;
  if (verify.error || !verify.data) {
    return (
      <Badge tone="neutral" icon={<ShieldAlert className="size-3" aria-hidden />}>
        Integrity unknown
      </Badge>
    );
  }
  return verify.data.valid ? (
    <Badge tone="allow" icon={<FileCheck2 className="size-3" aria-hidden />} title={verify.data.detail}>
      Hash chain intact · {verify.data.events_checked} events
    </Badge>
  ) : (
    <Badge tone="deny" icon={<ShieldAlert className="size-3" aria-hidden />} title={verify.data.detail}>
      Tampering detected at #{verify.data.first_invalid_sequence ?? '?'}
    </Badge>
  );
}

export function OverviewPage() {
  const { data, error, loading, reload } = useAsync(() => api.overview(), []);
  const verify = useAsync(() => api.verifyAudit(), []);

  return (
    <>
      <PageHeader
        title="Governance overview"
        description="Live state of agent identities, delegated authority and runtime decisions in the TrustGraph engine."
        actions={
          <Button size="sm" onClick={() => { reload(); verify.reload(); }} loading={loading} icon={<RefreshCw className="size-3.5" />}>
            Refresh
          </Button>
        }
      />
      {error ? (
        <Card>
          <ErrorState error={error} onRetry={reload} />
        </Card>
      ) : !data ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Stat
              label="Active agents"
              value={data.agents.active}
              hint={`${data.agents.total} registered · ${data.users} users`}
              icon={<Bot className="size-4" />}
            />
            <Stat
              label="Active delegations"
              value={data.delegations.active}
              hint={`${data.delegations.total} total · ${data.grants} direct grants`}
              icon={<GitFork className="size-4" />}
            />
            <Stat
              label="Pending approvals"
              value={data.approvals_pending}
              tone={data.approvals_pending ? 'warn' : 'default'}
              hint={<Link className="hover:underline" href="/approvals">Open queue →</Link>}
              icon={<UserCheck className="size-4" />}
            />
            <Stat label="Audit events" value={data.audit_events} hint={<IntegrityBadge verify={verify} />} icon={<ScrollText className="size-4" />} />
            <Stat label="Policies" value={data.policies} icon={<ShieldCheck className="size-4" />} />
            <Stat
              label="Resources"
              value={data.resources}
              hint={`${data.capabilities} capabilities`}
              icon={<Boxes className="size-4" />}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Recent authorisation decisions"
                description="Latest decisions recorded in the tamper-evident audit log."
                icon={<Activity className="size-4" />}
                actions={
                  <Link href="/audit?event_type=authorization" className="text-xs font-medium text-accent hover:underline">
                    View all
                  </Link>
                }
              />
              {data.recent_decisions.length ? (
                <ul className="divide-y divide-[var(--border)]">
                  {data.recent_decisions.map((event) => (
                    <li key={event.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <DecisionBadge decision={event.decision} />
                          <span className="text-[13px] font-medium">{event.actor_id}</span>
                          <span className="text-xs text-muted">
                            {event.tool_name ?? event.capability} · {event.action}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-fg-2" title={event.reason}>
                          {event.reason}
                        </p>
                        {event.principal_chain.length > 1 ? (
                          <div className="mt-1.5">
                            <PrincipalChain principals={event.principal_chain} />
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                        <RiskBadge score={event.risk_score} level={event.risk_level} />
                        <span className="text-[11px] text-muted">{relativeTime(event.timestamp)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No decisions recorded yet" />
              )}
            </Card>

            <div className="flex flex-col gap-5">
              <Card>
                <CardHeader title="Decision distribution" description="All authorisation decisions to date." />
                <CardBody>
                  <DecisionDistribution decisions={data.decisions} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Platform status" icon={<Database className="size-4" />} />
                <CardBody className="flex flex-col gap-3 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Governance engine</span>
                    <Badge tone={data.status === 'operational' ? 'allow' : 'restrict'}>{data.status}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Authoritative store</span>
                    <Code>{data.storage}</Code>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted">
                      <Network className="size-3.5" aria-hidden /> Neo4j projection
                    </span>
                    <Badge tone={data.neo4j.enabled ? 'allow' : 'neutral'}>{data.neo4j.enabled ? 'enabled' : 'disabled'}</Badge>
                  </div>
                  {data.neo4j.last_sync ? (
                    <p className="text-[11px] text-muted">
                      Last sync:{' '}
                      {Object.entries(data.neo4j.last_sync)
                        .map(([key, value]) => `${value} ${key}`)
                        .join(', ')}
                    </p>
                  ) : null}
                  {data.neo4j.last_error ? <p className="text-[11px] text-deny">{data.neo4j.last_error}</p> : null}
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Audit integrity</span>
                    <IntegrityBadge verify={verify} />
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      )}
      {loading && data ? <span className="sr-only" role="status">Refreshing…</span> : null}
    </>
  );
}
