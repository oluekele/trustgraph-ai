'use client';

import { Check, Play, RefreshCw, UserCheck, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { PrincipalChip } from '@/components/governance/AuthorityPathView';
import { ExecutionResultView } from '@/components/governance/DecisionPanel';
import { RiskBadge, StatusBadge } from '@/components/governance/badges';
import { Code } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Textarea } from '@/components/ui/Field';
import { DescList, JsonView, PageHeader, Segmented } from '@/components/ui/Page';
import { Alert, EmptyState, ErrorState, LoadingBlock, MutationError } from '@/components/ui/States';
import { Table, TableWrap, Td, Th, THead, Tr } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { formatDate, relativeTime } from '@/lib/format';
import { useAsync, useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { ApprovalRequest, ApprovalStatus, ExecutionResult } from '@/lib/types';

type Filter = ApprovalStatus | 'all';

function statusOf(approval: ApprovalRequest): ApprovalStatus {
  return approval.effective_status ?? approval.status;
}

function ApprovalDetail({
  approval,
  onChanged,
}: {
  approval: ApprovalRequest;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const [note, setNote] = useState('');
  const [current, setCurrent] = useState<ApprovalRequest>(approval);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const approve = useMutation(api.approve);
  const reject = useMutation(api.reject);
  const execute = useMutation(api.executeApproval);
  const status = statusOf(current);
  const decide = can('approvals.decide');

  async function onDecide(approved: boolean) {
    const updated = approved ? await approve.run(current.id, note || null) : await reject.run(current.id, note || null);
    if (updated) {
      setCurrent({ ...updated, effective_status: updated.status });
      onChanged();
    }
  }

  async function onExecute() {
    const executed = await execute.run(current.id);
    if (executed) {
      setResult(executed);
      onChanged();
      setCurrent((value) => ({ ...value, effective_status: 'consumed', status: 'consumed' }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DescList
        items={[
          ['Status', <StatusBadge key="s" status={status} />],
          ['Agent', <PrincipalChip key="a" id={current.agent_id} />],
          ['Tool', current.tool_name ? <Code key="t">{current.tool_name}</Code> : '—'],
          ['Permission', `${current.capability} · ${current.resource} · ${current.action}`],
          ['Purpose', current.purpose ?? '—'],
          ['Risk', <RiskBadge key="r" score={current.risk_score} level={current.risk_level} />],
          ['Reason', current.reason],
          ['Requested', formatDate(current.requested_at)],
          ['Expires', `${formatDate(current.expires_at)} (${relativeTime(current.expires_at)})`],
          ['Decided', current.decided_at ? `${formatDate(current.decided_at)} by ${current.decided_by}` : '—'],
          ['Note', current.decision_note ?? '—'],
          ['Fingerprint', <Code key="f">{current.fingerprint}</Code>],
        ]}
      />
      <div>
        <h3 className="mb-1 text-xs font-semibold text-fg-2">Arguments (bound to this approval)</h3>
        <JsonView value={current.arguments} maxHeight={220} />
      </div>
      {status === 'pending' ? (
        decide ? (
          <Card>
            <CardHeader title="Decision" description="The approval is bound to this exact action by fingerprint; authority and risk are re-validated on execution." />
            <CardBody className="flex flex-col gap-3">
              <Field label="Note (optional)">
                {(id) => <Textarea id={id} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} className="min-h-[60px]" />}
              </Field>
              <MutationError error={approve.error ?? reject.error} />
              <div className="flex gap-2">
                <Button variant="success" loading={approve.pending} onClick={() => onDecide(true)} icon={<Check className="size-4" />}>
                  Approve
                </Button>
                <Button variant="danger" loading={reject.pending} onClick={() => onDecide(false)} icon={<X className="size-4" />}>
                  Reject
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : (
          <Alert tone="info">Approving or rejecting requires the approver role.</Alert>
        )
      ) : null}
      {status === 'approved' && current.tool_name ? (
        decide ? (
          <div className="flex flex-col gap-2">
            <MutationError error={execute.error} />
            <Button variant="primary" className="self-start" loading={execute.pending} onClick={onExecute} icon={<Play className="size-4" />}>
              Execute approved action
            </Button>
          </div>
        ) : null
      ) : null}
      {result ? (
        <section aria-label="Execution result">
          <h3 className="mb-2 text-sm font-semibold">Execution result</h3>
          <ExecutionResultView result={result} />
        </section>
      ) : null}
    </div>
  );
}

function ApprovalsView() {
  const params = useSearchParams();
  const router = useRouter();
  const selectedId = params.get('id');
  const [filter, setFilter] = useState<Filter>('pending');
  const approvals = useAsync(() => api.approvals(), []);
  const selected = useAsync(() => api.approval(selectedId ?? ''), [selectedId], Boolean(selectedId));

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const approval of approvals.data ?? []) result[statusOf(approval)] = (result[statusOf(approval)] ?? 0) + 1;
    return result;
  }, [approvals.data]);

  const rows = useMemo(
    () =>
      (approvals.data ?? [])
        .filter((approval) => filter === 'all' || statusOf(approval) === filter)
        .sort((a, b) => b.requested_at.localeCompare(a.requested_at)),
    [approvals.data, filter],
  );

  const open = (id: string | null) => router.replace(id ? `/approvals?id=${encodeURIComponent(id)}` : '/approvals', { scroll: false });
  const label = (status: Filter, text: string) => `${text}${status !== 'all' && counts[status] ? ` (${counts[status]})` : ''}`;

  return (
    <>
      <PageHeader
        title="Human approvals"
        icon={<UserCheck className="size-5" />}
        description="High-risk or policy-gated actions wait here for a human decision. Approvals are single-use and expire."
        actions={
          <Button size="sm" onClick={approvals.reload} icon={<RefreshCw className="size-3.5" />}>
            Refresh
          </Button>
        }
      />
      <Card>
        <div className="border-b border-line p-3">
          <Segmented<Filter>
            label="Approval status"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'pending', label: label('pending', 'Pending') },
              { value: 'approved', label: label('approved', 'Approved') },
              { value: 'rejected', label: label('rejected', 'Rejected') },
              { value: 'consumed', label: label('consumed', 'Consumed') },
              { value: 'expired', label: label('expired', 'Expired') },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        {approvals.error ? (
          <ErrorState error={approvals.error} onRetry={approvals.reload} />
        ) : !approvals.data ? (
          <LoadingBlock rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState title={`No ${filter === 'all' ? '' : filter} approvals`} description="Requests appear when a decision is require_approval." />
        ) : (
          <TableWrap>
            <Table>
              <caption className="sr-only">Approval requests</caption>
              <THead>
                <tr>
                  <Th>Agent</Th>
                  <Th>Action</Th>
                  <Th>Resource</Th>
                  <Th>Risk</Th>
                  <Th>Reason</Th>
                  <Th>Requested</Th>
                  <Th>Expires</Th>
                  <Th>Status</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((approval) => (
                  <Tr key={approval.id} onClick={() => open(approval.id)} selected={approval.id === selectedId}>
                    <Td className="font-mono text-xs">{approval.agent_id}</Td>
                    <Td>
                      <span className="font-medium">{approval.tool_name ?? approval.capability}</span>
                      <span className="block text-xs text-muted">{approval.action}</span>
                    </Td>
                    <Td className="font-mono text-xs">{approval.resource}</Td>
                    <Td><RiskBadge score={approval.risk_score} level={approval.risk_level} /></Td>
                    <Td className="max-w-xs text-xs">{approval.reason}</Td>
                    <Td className="text-xs whitespace-nowrap" title={formatDate(approval.requested_at)}>{relativeTime(approval.requested_at)}</Td>
                    <Td className="text-xs whitespace-nowrap" title={formatDate(approval.expires_at)}>{relativeTime(approval.expires_at)}</Td>
                    <Td><StatusBadge status={statusOf(approval)} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
      <Dialog open={Boolean(selectedId)} onClose={() => open(null)} variant="drawer" size="lg" title="Approval request" description={selectedId ?? undefined}>
        {selected.error ? (
          <ErrorState error={selected.error} onRetry={selected.reload} />
        ) : selected.data && selected.data.id === selectedId ? (
          <ApprovalDetail key={selected.data.id} approval={selected.data} onChanged={approvals.reload} />
        ) : (
          <LoadingBlock rows={8} />
        )}
      </Dialog>
    </>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<LoadingBlock rows={6} />}>
      <ApprovalsView />
    </Suspense>
  );
}
