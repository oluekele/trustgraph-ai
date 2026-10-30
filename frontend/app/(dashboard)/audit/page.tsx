'use client';

import { ChevronLeft, ChevronRight, FileCheck2, RefreshCw, ScrollText, ShieldAlert } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { AuditEventDetail } from '@/components/audit/AuditEventDetail';
import { DecisionBadge, RiskBadge, StatusBadge } from '@/components/governance/badges';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/Page';
import { Alert, EmptyState, ErrorState, LoadingBlock, MutationError } from '@/components/ui/States';
import { Table, TableWrap, Td, Th, THead, Tr } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAsync, useMutation } from '@/lib/hooks';
import { AUDIT_EVENT_TYPES, type AuditEvent, type AuditQuery } from '@/lib/types';

const PAGE_SIZE = 50;

function AuditView() {
  const params = useSearchParams();
  const [filters, setFilters] = useState<AuditQuery>({
    actor_id: params.get('actor_id') ?? undefined,
    event_type: params.get('event_type') ?? undefined,
    decision: params.get('decision') ?? undefined,
    request_id: params.get('request_id') ?? undefined,
  });
  const [draft, setDraft] = useState<AuditQuery>(filters);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const page = useAsync(() => api.audit({ ...filters, limit: PAGE_SIZE, offset }), [filters, offset]);
  const principals = useAsync(() => api.principals(), []);
  const verify = useMutation(api.verifyAudit);
  const [verification, setVerification] = useState<Awaited<ReturnType<typeof api.verifyAudit>> | null>(null);

  const filtered = Boolean(filters.actor_id || filters.event_type || filters.decision || filters.request_id);
  const events = page.data?.events ?? [];
  const hasNext = events.length === PAGE_SIZE;

  function apply(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setFilters({ ...draft });
  }

  function clear() {
    setDraft({});
    setFilters({});
    setOffset(0);
  }

  return (
    <>
      <PageHeader
        title="Audit trail"
        icon={<ScrollText className="size-5" />}
        description="Every governance decision and change, hash-chained so alteration or deletion is detectable."
        actions={
          <>
            <Button size="sm" onClick={page.reload} icon={<RefreshCw className="size-3.5" />}>
              Refresh
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={verify.pending}
              icon={<FileCheck2 className="size-3.5" />}
              onClick={async () => {
                const result = await verify.run();
                if (result) setVerification(result);
              }}
            >
              Verify integrity
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <MutationError error={verify.error} />
        {verification ? (
          <Alert
            tone={verification.valid ? 'success' : 'error'}
            title={verification.valid ? 'Audit hash chain verified' : 'Audit chain integrity failure'}
            action={<Button size="sm" variant="ghost" onClick={() => setVerification(null)}>Dismiss</Button>}
          >
            {verification.detail} ({verification.events_checked} events checked
            {verification.first_invalid_sequence !== null ? `; first invalid #${verification.first_invalid_sequence}` : ''})
          </Alert>
        ) : null}
        <Card>
          <form onSubmit={apply} className="grid gap-3 border-b border-line p-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Audit filters">
            <Field label="Actor">
              {(id) => (
                <Select id={id} value={draft.actor_id ?? ''} onChange={(event) => setDraft({ ...draft, actor_id: event.target.value || undefined })}>
                  <option value="">Any</option>
                  {(principals.data ?? []).map((principal) => (
                    <option key={principal.id} value={principal.id}>{principal.id}</option>
                  ))}
                  {draft.actor_id && !(principals.data ?? []).some((principal) => principal.id === draft.actor_id) ? (
                    <option value={draft.actor_id}>{draft.actor_id}</option>
                  ) : null}
                </Select>
              )}
            </Field>
            <Field label="Event type">
              {(id) => (
                <Select id={id} value={draft.event_type ?? ''} onChange={(event) => setDraft({ ...draft, event_type: event.target.value || undefined })}>
                  <option value="">Any</option>
                  {AUDIT_EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Decision">
              {(id) => (
                <Select id={id} value={draft.decision ?? ''} onChange={(event) => setDraft({ ...draft, decision: event.target.value || undefined })}>
                  <option value="">Any</option>
                  <option value="allow">Allow</option>
                  <option value="restrict">Restrict</option>
                  <option value="require_approval">Require approval</option>
                  <option value="deny">Deny</option>
                </Select>
              )}
            </Field>
            <Field label="Request id">
              {(id) => <Input id={id} value={draft.request_id ?? ''} onChange={(event) => setDraft({ ...draft, request_id: event.target.value || undefined })} placeholder="req-…" />}
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" variant="primary">Apply</Button>
              <Button onClick={clear}>Clear</Button>
            </div>
          </form>
          {page.error ? (
            <ErrorState error={page.error} onRetry={page.reload} />
          ) : !page.data ? (
            <LoadingBlock rows={10} />
          ) : events.length === 0 ? (
            <EmptyState title="No audit events match" />
          ) : (
            <TableWrap>
              <Table>
                <caption className="sr-only">Audit events</caption>
                <THead>
                  <tr>
                    <Th className="text-right">#</Th>
                    <Th>Time</Th>
                    <Th>Event</Th>
                    <Th>Actor</Th>
                    <Th>Target</Th>
                    <Th>Decision</Th>
                    <Th>Risk</Th>
                    <Th>Reason</Th>
                  </tr>
                </THead>
                <tbody>
                  {events.map((event) => (
                    <Tr key={event.id} onClick={() => setSelected(event)} selected={selected?.id === event.id}>
                      <Td className="text-right text-xs tabular-nums text-muted">{event.sequence}</Td>
                      <Td className="text-xs whitespace-nowrap">{formatDate(event.timestamp)}</Td>
                      <Td>
                        <Badge mono>{event.event_type}</Badge>
                        {event.execution_status ? <div className="mt-1"><StatusBadge status={event.execution_status} /></div> : null}
                      </Td>
                      <Td className="font-mono text-xs whitespace-nowrap">{event.actor_id}</Td>
                      <Td className="text-xs">
                        {event.tool_name ?? event.capability ?? '—'}
                        {event.resource ? <span className="block font-mono text-[11px] text-muted">{event.resource}</span> : null}
                      </Td>
                      <Td><DecisionBadge decision={event.decision} /></Td>
                      <Td><RiskBadge score={event.risk_score} level={event.risk_level} /></Td>
                      <Td className="max-w-sm truncate text-xs" title={event.reason}>{event.reason || '—'}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs text-muted">
            <span>
              {events.length ? `Showing ${offset + 1}–${offset + events.length}` : 'No results'}
              {!filtered && page.data ? ` of ${page.data.total}` : ''} · newest first
            </span>
            <div className="flex gap-2">
              <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} icon={<ChevronLeft className="size-3.5" />}>
                Previous
              </Button>
              <Button size="sm" disabled={!hasNext} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Next <ChevronRight className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        </Card>
      </div>
      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        variant="drawer"
        size="lg"
        title={selected ? `Audit event ${selected.id}` : 'Audit event'}
        description={selected ? (
          <span className="inline-flex items-center gap-1">
            {selected.hash ? <FileCheck2 className="size-3" aria-hidden /> : <ShieldAlert className="size-3" aria-hidden />} sequence #{selected.sequence}
          </span>
        ) : undefined}
      >
        {selected ? <AuditEventDetail event={selected} /> : null}
      </Dialog>
    </>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<LoadingBlock rows={10} />}>
      <AuditView />
    </Suspense>
  );
}
