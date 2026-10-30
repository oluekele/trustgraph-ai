'use client';

import { Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PolicyFormDialog, policyToInput } from '@/components/policies/PolicyForm';
import { Badge, Code, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/Page';
import { Alert, EmptyState, ErrorState, LoadingBlock, MutationError } from '@/components/ui/States';
import { Table, TableWrap, Td, Th, THead } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAsync, useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Policy, PolicyConditions } from '@/lib/types';

const EFFECT_TONE: Record<string, Tone> = { allow: 'allow', require_approval: 'approval', deny: 'deny' };

function MatchList({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-xs text-muted">any</span>;
  return (
    <div className="flex max-w-56 min-w-[110px] flex-wrap gap-1">
      {items.map((item) => (
        <Badge key={item} mono>
          {item}
        </Badge>
      ))}
    </div>
  );
}

function conditionLabels(conditions: PolicyConditions): string[] {
  const labels: string[] = [];
  if (conditions.require_purpose) labels.push('purpose required');
  if (conditions.direct_authority_only) labels.push('direct authority only');
  if (conditions.max_risk_score !== null) labels.push(`risk ≤ ${conditions.max_risk_score}`);
  if (conditions.max_delegation_hops !== null) labels.push(`hops ≤ ${conditions.max_delegation_hops}`);
  if (conditions.allowed_hours_utc) labels.push(`${conditions.allowed_hours_utc[0]}:00–${conditions.allowed_hours_utc[1]}:00 UTC`);
  return labels;
}

export default function PoliciesPage() {
  const { can } = useSession();
  const manage = can('policies.manage');
  const policies = useAsync(() => api.policies(), []);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const toggle = useMutation((policy: Policy) => api.updatePolicy(policy.id, policyToInput(policy, { enabled: !policy.enabled })));
  const remove = useMutation(async (id: string) => {
    await api.deletePolicy(id);
    return true;
  });

  const sorted = [...(policies.data ?? [])].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  async function onToggle(policy: Policy) {
    const saved = await toggle.run(policy);
    if (saved) {
      setNotice(`${saved.name} ${saved.enabled ? 'enabled' : 'disabled'} (v${saved.version}).`);
      policies.reload();
    }
  }

  async function onDelete(policy: Policy) {
    if (!window.confirm(`Delete policy "${policy.name}"? This is recorded in the audit log.`)) return;
    if (await remove.run(policy.id)) {
      setNotice(`Policy ${policy.id} deleted.`);
      policies.reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Policies"
        icon={<ShieldCheck className="size-5" />}
        description="Organisational rules evaluated after authority is established. Lower priority numbers are evaluated first; explicit deny wins."
        actions={
          <>
            <Button size="sm" onClick={policies.reload} icon={<RefreshCw className="size-3.5" />}>
              Refresh
            </Button>
            {manage ? (
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="size-3.5" />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                New policy
              </Button>
            ) : null}
          </>
        }
      />
      <div className="flex flex-col gap-4">
        {notice ? (
          <Alert tone="success" action={<Button size="sm" variant="ghost" onClick={() => setNotice(null)}>Dismiss</Button>}>
            {notice}
          </Alert>
        ) : null}
        <MutationError error={toggle.error ?? remove.error} />
        <Card>
          {policies.error ? (
            <ErrorState error={policies.error} onRetry={policies.reload} />
          ) : !policies.data ? (
            <LoadingBlock rows={8} />
          ) : sorted.length === 0 ? (
            <EmptyState title="No policies" description="Without an allow policy every request is denied by default." />
          ) : (
            <TableWrap>
              <Table>
                <caption className="sr-only">Policies</caption>
                <THead>
                  <tr>
                    <Th className="text-right">Priority</Th>
                    <Th>Policy</Th>
                    <Th>Effect</Th>
                    <Th>Subjects</Th>
                    <Th>Capabilities</Th>
                    <Th>Resources</Th>
                    <Th>Actions</Th>
                    <Th>Conditions</Th>
                    <Th>Enabled</Th>
                    {manage ? <Th className="text-right">Manage</Th> : null}
                  </tr>
                </THead>
                <tbody>
                  {sorted.map((policy) => {
                    const conditions = conditionLabels(policy.conditions);
                    return (
                      <tr key={policy.id} className={policy.enabled ? undefined : 'opacity-60'}>
                        <Td className="text-right tabular-nums">{policy.priority}</Td>
                        <Td className="min-w-[240px]">
                          <p className="font-medium">{policy.name}</p>
                          <p className="mt-0.5 text-[11px] text-muted">
                            <Code>{policy.id}</Code> · <span title={`Updated ${formatDate(policy.updated_at)}`}>v{policy.version}</span>
                          </p>
                          {policy.description ? <p className="mt-1 max-w-xs text-xs text-fg-2">{policy.description}</p> : null}
                        </Td>
                        <Td>
                          <Badge tone={EFFECT_TONE[policy.effect] ?? 'neutral'}>{policy.effect.replace('_', ' ')}</Badge>
                        </Td>
                        <Td><MatchList items={policy.subjects} /></Td>
                        <Td><MatchList items={policy.capabilities} /></Td>
                        <Td><MatchList items={policy.resources} /></Td>
                        <Td><MatchList items={policy.actions} /></Td>
                        <Td>
                          {conditions.length ? (
                            <ul className="text-xs">
                              {conditions.map((label) => (
                                <li key={label}>{label}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-xs text-muted">none</span>
                          )}
                        </Td>
                        <Td>
                          {manage ? (
                            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
                              <input
                                type="checkbox"
                                className="size-4 accent-[var(--accent)]"
                                checked={policy.enabled}
                                disabled={toggle.pending}
                                onChange={() => onToggle(policy)}
                                aria-label={`${policy.enabled ? 'Disable' : 'Enable'} ${policy.name}`}
                              />
                              {policy.enabled ? 'On' : 'Off'}
                            </label>
                          ) : (
                            <Badge tone={policy.enabled ? 'allow' : 'neutral'}>{policy.enabled ? 'enabled' : 'disabled'}</Badge>
                          )}
                        </Td>
                        {manage ? (
                          <Td className="text-right whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Edit ${policy.name}`}
                              icon={<Pencil className="size-3.5" />}
                              onClick={() => {
                                setEditing(policy);
                                setFormOpen(true);
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Delete ${policy.name}`}
                              className="text-deny"
                              icon={<Trash2 className="size-3.5" />}
                              onClick={() => onDelete(policy)}
                            />
                          </Td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>
      {formOpen ? (
        <PolicyFormDialog
          key={editing?.id ?? 'new'}
          open={formOpen}
          policy={editing}
          onClose={() => setFormOpen(false)}
          onSaved={(saved) => {
            setFormOpen(false);
            setNotice(`Saved ${saved.name} (v${saved.version}).`);
            policies.reload();
          }}
        />
      ) : null}
    </>
  );
}
