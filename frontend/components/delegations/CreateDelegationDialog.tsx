'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { DirectBadge } from '@/components/governance/badges';
import { Code } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, LoadingBlock, MutationError } from '@/components/ui/States';
import { api } from '@/lib/api';
import { localInputToIso, permissionKey } from '@/lib/format';
import { useAsync, useMutation } from '@/lib/hooks';
import type { DelegationResult, Principal } from '@/lib/types';

export function CreateDelegationDialog({
  open,
  onClose,
  principals,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  principals: Principal[];
  onCreated: () => void;
}) {
  const [delegator, setDelegator] = useState('');
  const [delegatee, setDelegatee] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [purpose, setPurpose] = useState('');
  const [depth, setDepth] = useState(0);
  const [expires, setExpires] = useState('');
  const [result, setResult] = useState<DelegationResult | null>(null);
  const authority = useAsync(() => api.authority(delegator), [delegator], open && Boolean(delegator));
  const mutation = useMutation(api.createDelegation);

  useEffect(() => setSelected(new Set()), [delegator]);

  const agents = principals.filter((principal) => principal.kind === 'agent');
  const permissions = authority.data?.permissions ?? [];

  function close() {
    setResult(null);
    mutation.reset();
    onClose();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const grants = permissions.filter((entry) => selected.has(permissionKey(entry.permission))).map((entry) => entry.permission);
    const response = await mutation.run({
      delegator_id: delegator,
      delegatee_id: delegatee,
      grants,
      purpose,
      max_redelegation_depth: depth,
      expires_at: localInputToIso(expires),
    });
    if (response) {
      setResult(response);
      if (response.accepted) onCreated();
    }
  }

  function toggle(key: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="Create delegation"
      description="Delegate a subset of the delegator's effective authority. TrustGraph validates attenuation, depth, expiry and identity."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {result ? (
          result.accepted ? (
            <Alert tone="success" title="Delegation accepted" action={<Button size="sm" onClick={close}>Close</Button>}>
              {result.reason} {result.delegation ? <Code>{result.delegation.id}</Code> : null}
            </Alert>
          ) : (
            <Alert tone="error" title="Delegation rejected by TrustGraph">
              <p>{result.reason}</p>
              {result.violations.length ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {result.violations.map((violation) => (
                    <li key={violation} className="flex items-start gap-1.5">
                      <XCircle className="mt-0.5 size-3.5 shrink-0 text-deny" aria-hidden />
                      {violation}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          )
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Delegator" required hint="User or agent passing on authority.">
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} required value={delegator} onChange={(event) => setDelegator(event.target.value)}>
                <option value="">Select…</option>
                {principals.map((principal) => (
                  <option key={principal.id} value={principal.id}>
                    {principal.id} ({principal.kind}){principal.status !== 'active' ? ` — ${principal.status}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Delegatee (agent)" required>
            {(id) => (
              <Select id={id} required value={delegatee} onChange={(event) => setDelegatee(event.target.value)}>
                <option value="">Select…</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.id}{agent.status !== 'active' ? ` — ${agent.status}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <fieldset className="rounded-md border border-line">
          <legend className="ml-2 px-1 text-xs font-medium text-fg-2">Permissions from the delegator&apos;s effective authority</legend>
          {!delegator ? (
            <p className="p-3 text-xs text-muted">Choose a delegator to list its authority.</p>
          ) : authority.error ? (
            <ErrorState error={authority.error} onRetry={authority.reload} />
          ) : authority.loading ? (
            <LoadingBlock rows={3} />
          ) : permissions.length === 0 ? (
            <EmptyState title="The delegator holds no authority" description="Nothing can be delegated." />
          ) : (
            <ul className="max-h-64 divide-y divide-[var(--border)] overflow-y-auto">
              {permissions.map((entry) => {
                const key = permissionKey(entry.permission);
                const best = Math.max(...entry.paths.map((path) => path.remaining_depth));
                const hops = Math.min(...entry.paths.map((path) => path.chain.length));
                return (
                  <li key={key} className="flex items-start gap-2 px-3 py-2">
                    <input
                      id={`perm-${key}`}
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--accent)]"
                      checked={selected.has(key)}
                      onChange={(event) => toggle(key, event.target.checked)}
                    />
                    <label htmlFor={`perm-${key}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      <span className="font-medium">{entry.permission.capability}</span>
                      <span className="font-mono text-[11.5px] text-fg-2">{entry.permission.resource}</span>
                      <span>{entry.permission.action}</span>
                      <DirectBadge direct={entry.direct} hops={entry.direct ? undefined : hops} />
                      {entry.delegable ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-allow">
                          <CheckCircle2 className="size-3" aria-hidden /> delegable (depth {best})
                        </span>
                      ) : (
                        <span className="text-[11px] text-restrict">not delegable — will be rejected</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Purpose" className="sm:col-span-3">
            {(id) => <Textarea id={id} className="min-h-[56px]" value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="e.g. Weekly reporting run" />}
          </Field>
          <Field label="Max re-delegation depth" hint="0 = delegatee may use but not re-delegate">
            {(id, describedBy) => (
              <Input id={id} aria-describedby={describedBy} type="number" min={0} max={10} value={depth} onChange={(event) => setDepth(Number(event.target.value))} />
            )}
          </Field>
          <Field label="Expires (optional)" className="sm:col-span-2">
            {(id) => <Input id={id} type="datetime-local" value={expires} onChange={(event) => setExpires(event.target.value)} />}
          </Field>
        </div>
        <MutationError error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Close</Button>
          <Button type="submit" variant="primary" loading={mutation.pending} disabled={!delegator || !delegatee || selected.size === 0}>
            Delegate {selected.size ? `${selected.size} permission${selected.size === 1 ? '' : 's'}` : ''}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
