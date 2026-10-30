import type { ReactNode } from 'react';
import { Link2 } from 'lucide-react';
import { PrincipalChain } from '@/components/governance/AuthorityPathView';
import { DecisionBadge, RiskBadge, StatusBadge } from '@/components/governance/badges';
import { TraceView } from '@/components/governance/Trace';
import { Badge, Code } from '@/components/ui/Badge';
import { DescList, JsonView } from '@/components/ui/Page';
import { formatDate, humanize } from '@/lib/format';
import type { AuditEvent, JsonValue, TraceStep } from '@/lib/types';

function isTrace(value: JsonValue | undefined): value is TraceStep[] & JsonValue {
  return (
    Array.isArray(value) &&
    value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item) && 'step' in item && 'outcome' in item)
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function AuditEventDetail({ event }: { event: AuditEvent }) {
  const trace = event.details.trace;
  const { trace: _omit, ...otherDetails } = event.details;
  void _omit;
  const factors = event.risk_factors ? Object.entries(event.risk_factors) : [];
  return (
    <div className="flex flex-col gap-5">
      <DescList
        items={[
          ['Sequence', <span key="seq" className="tabular-nums">#{event.sequence}</span>],
          ['Event', <Badge key="t" mono>{event.event_type}</Badge>],
          ['Timestamp', formatDate(event.timestamp)],
          ['Actor', <Code key="a">{event.actor_id}</Code>],
          ['On behalf of', event.on_behalf_of ?? '—'],
          ['Request', event.request_id ? <Code key="r">{event.request_id}</Code> : '—'],
          ['Tool', event.tool_name ?? '—'],
          ['Capability', event.capability ?? '—'],
          ['Resource', event.resource ? <Code key="res">{event.resource}</Code> : '—'],
          ['Action', event.action ?? '—'],
          ['Purpose', event.purpose ?? '—'],
          ['Decision', <DecisionBadge key="d" decision={event.decision} />],
          ['Execution', event.execution_status ? <StatusBadge key="x" status={event.execution_status} /> : '—'],
          ['Risk', <RiskBadge key="risk" score={event.risk_score} level={event.risk_level} />],
          ['Reason', event.reason || '—'],
          [
            'Policies',
            event.policy_ids.length ? (
              <span key="p" className="flex flex-wrap gap-1">
                {event.policy_ids.map((id) => (
                  <Badge key={id} mono>{id}</Badge>
                ))}
              </span>
            ) : (
              '—'
            ),
          ],
        ]}
      />
      {event.principal_chain.length ? (
        <Section title="Principal & delegation chain">
          <PrincipalChain principals={event.principal_chain} delegations={event.delegation_chain} />
        </Section>
      ) : event.delegation_chain.length ? (
        <Section title="Delegation chain">
          <p className="font-mono text-xs">{event.delegation_chain.join(' → ')}</p>
        </Section>
      ) : null}
      {factors.length ? (
        <Section title="Risk factors">
          <DescList items={factors.map(([key, value]) => [humanize(key), <span key={key} className="tabular-nums">{value.toFixed(1)}</span>])} />
        </Section>
      ) : null}
      {isTrace(trace) ? (
        <Section title="Decision trace">
          <TraceView trace={trace} />
        </Section>
      ) : null}
      {Object.keys(otherDetails).length ? (
        <Section title="Details">
          <JsonView value={otherDetails} maxHeight={260} />
        </Section>
      ) : null}
      <Section title="Hash chain">
        <div className="flex flex-col gap-2 text-xs">
          <div>
            <span className="text-muted">prev_hash</span>
            <Code className="mt-0.5 block">{event.prev_hash || '(genesis)'}</Code>
          </div>
          <div className="flex items-center gap-1 text-muted">
            <Link2 className="size-3.5" aria-hidden /> hash = sha256(prev_hash + canonical(event))
          </div>
          <div>
            <span className="text-muted">hash</span>
            <Code className="mt-0.5 block">{event.hash}</Code>
          </div>
        </div>
      </Section>
    </div>
  );
}
