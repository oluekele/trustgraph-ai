'use client';

import { GitFork, Plus, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { CreateDelegationDialog } from '@/components/delegations/CreateDelegationDialog';
import { DelegationChainView } from '@/components/delegations/DelegationChainView';
import { DelegationTable } from '@/components/delegations/DelegationTable';
import { Code } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/Page';
import { Alert, ErrorState, LoadingBlock, MutationError } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useAsync, useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Delegation, DelegationStatus } from '@/lib/types';

export default function DelegationsPage() {
  const { can } = useSession();
  const [status, setStatus] = useState<DelegationStatus | ''>('');
  const [principal, setPrincipal] = useState('');
  const delegations = useAsync(
    () => api.delegations({ status: status || undefined, principal_id: principal || undefined }),
    [status, principal],
  );
  const principals = useAsync(() => api.principals(), []);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useAsync(() => api.delegation(selected ?? ''), [selected], Boolean(selected));
  const [revoking, setRevoking] = useState<Delegation | null>(null);
  const [reason, setReason] = useState('Revoked by operator.');
  const [revoked, setRevoked] = useState<Delegation[] | null>(null);
  const revokeMutation = useMutation(api.revokeDelegation);
  const manage = can('delegations.manage');

  async function confirmRevoke() {
    if (!revoking) return;
    const result = await revokeMutation.run(revoking.id, reason);
    if (result) {
      setRevoked(result.revoked);
      setRevoking(null);
      delegations.reload();
      if (selected) detail.reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Delegations"
        icon={<GitFork className="size-5" />}
        description="Authority handed from users to agents and between agents. Revocation cascades to every downstream re-delegation."
        actions={
          <>
            <Button size="sm" onClick={delegations.reload} icon={<RefreshCw className="size-3.5" />}>
              Refresh
            </Button>
            {manage ? (
              <Button size="sm" variant="primary" onClick={() => setCreating(true)} icon={<Plus className="size-3.5" />}>
                New delegation
              </Button>
            ) : null}
          </>
        }
      />
      {revoked ? (
        <Alert
          tone="warning"
          title={`${revoked.length} delegation${revoked.length === 1 ? '' : 's'} revoked`}
          className="mb-4"
          action={<Button size="sm" variant="ghost" onClick={() => setRevoked(null)}>Dismiss</Button>}
        >
          {revoked.length > 1 ? 'Cascade: ' : ''}
          {revoked.map((delegation, index) => (
            <span key={delegation.id}>
              {index ? ', ' : ''}
              <Code>{delegation.id}</Code> ({delegation.delegator_id} → {delegation.delegatee_id})
            </span>
          ))}
        </Alert>
      ) : null}
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-3">
          <Field label="Status" className="w-40">
            {(id) => (
              <Select id={id} value={status} onChange={(event) => setStatus(event.target.value as DelegationStatus | '')}>
                <option value="">Any</option>
                <option value="active">Active</option>
                <option value="revoked">Revoked</option>
                <option value="expired">Expired</option>
              </Select>
            )}
          </Field>
          <Field label="Involving principal" className="w-56">
            {(id) => (
              <Select id={id} value={principal} onChange={(event) => setPrincipal(event.target.value)}>
                <option value="">Any</option>
                {(principals.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <p className="pb-2 text-xs text-muted">Click a row to view its chain.</p>
        </div>
        {delegations.error ? (
          <ErrorState error={delegations.error} onRetry={delegations.reload} />
        ) : !delegations.data ? (
          <LoadingBlock rows={6} />
        ) : (
          <DelegationTable
            delegations={delegations.data}
            selectedId={selected}
            onSelect={(delegation) => setSelected(delegation.id)}
            emptyText="No delegations match these filters."
            actions={
              manage
                ? (delegation) =>
                    delegation.effective_status === 'active' ? (
                      <Button size="sm" variant="danger" onClick={() => setRevoking(delegation)} icon={<XCircle className="size-3.5" />}>
                        Revoke
                      </Button>
                    ) : null
                : undefined
            }
          />
        )}
      </Card>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        variant="drawer"
        size="md"
        title="Delegation chain"
        description={selected ?? undefined}
      >
        {detail.error ? (
          <ErrorState error={detail.error} onRetry={detail.reload} />
        ) : detail.data && detail.data.delegation.id === selected ? (
          <DelegationChainView detail={detail.data} />
        ) : (
          <LoadingBlock rows={6} />
        )}
      </Dialog>

      <Dialog
        open={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        size="sm"
        title="Revoke delegation"
        description={revoking ? `${revoking.id}: ${revoking.delegator_id} → ${revoking.delegatee_id}` : undefined}
        footer={
          <>
            <Button onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="danger" loading={revokeMutation.pending} onClick={confirmRevoke}>
              Revoke with cascade
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Alert tone="warning">Every delegation derived from this one will also be revoked, effective immediately.</Alert>
          <Field label="Reason">
            {(id) => <Textarea id={id} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />}
          </Field>
          <MutationError error={revokeMutation.error} />
        </div>
      </Dialog>

      {manage ? (
        <CreateDelegationDialog
          open={creating}
          onClose={() => setCreating(false)}
          principals={principals.data ?? []}
          onCreated={delegations.reload}
        />
      ) : null}
    </>
  );
}
