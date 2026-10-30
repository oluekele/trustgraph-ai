'use client';

import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { MutationError } from '@/components/ui/States';
import { api } from '@/lib/api';
import { splitList } from '@/lib/format';
import { useMutation } from '@/lib/hooks';
import type { Policy, PolicyEffect, PolicyInput } from '@/lib/types';

interface Draft {
  id: string;
  name: string;
  description: string;
  effect: PolicyEffect;
  priority: string;
  subjects: string;
  capabilities: string;
  resources: string;
  actions: string;
  enabled: boolean;
  require_purpose: boolean;
  direct_authority_only: boolean;
  max_risk_score: string;
  max_delegation_hops: string;
  hours_start: string;
  hours_end: string;
}

function toDraft(policy?: Policy): Draft {
  return {
    id: policy?.id ?? '',
    name: policy?.name ?? '',
    description: policy?.description ?? '',
    effect: policy?.effect ?? 'allow',
    priority: String(policy?.priority ?? 100),
    subjects: policy?.subjects.join(', ') ?? '',
    capabilities: policy?.capabilities.join(', ') ?? '',
    resources: policy?.resources.join(', ') ?? '',
    actions: policy?.actions.join(', ') ?? '',
    enabled: policy?.enabled ?? true,
    require_purpose: policy?.conditions.require_purpose ?? false,
    direct_authority_only: policy?.conditions.direct_authority_only ?? false,
    max_risk_score: policy?.conditions.max_risk_score?.toString() ?? '',
    max_delegation_hops: policy?.conditions.max_delegation_hops?.toString() ?? '',
    hours_start: policy?.conditions.allowed_hours_utc?.[0]?.toString() ?? '',
    hours_end: policy?.conditions.allowed_hours_utc?.[1]?.toString() ?? '',
  };
}

export function policyToInput(policy: Policy, patch: Partial<PolicyInput> = {}): PolicyInput {
  return {
    id: policy.id,
    name: policy.name,
    description: policy.description,
    effect: policy.effect,
    priority: policy.priority,
    subjects: policy.subjects,
    capabilities: policy.capabilities,
    resources: policy.resources,
    actions: policy.actions,
    conditions: policy.conditions,
    enabled: policy.enabled,
    ...patch,
  };
}

function fromDraft(draft: Draft): { value?: PolicyInput; error?: string } {
  const optionalNumber = (raw: string, label: string, max?: number): number | null | string => {
    if (!raw.trim()) return null;
    const value = Number(raw);
    if (Number.isNaN(value) || value < 0 || (max !== undefined && value > max)) return `${label} must be between 0 and ${max ?? '∞'}.`;
    return value;
  };
  const risk = optionalNumber(draft.max_risk_score, 'Max risk score', 100);
  if (typeof risk === 'string') return { error: risk };
  const hops = optionalNumber(draft.max_delegation_hops, 'Max delegation hops');
  if (typeof hops === 'string') return { error: hops };
  let hours: [number, number] | null = null;
  if (draft.hours_start.trim() || draft.hours_end.trim()) {
    const start = Number(draft.hours_start);
    const end = Number(draft.hours_end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 24 || end < 0 || end > 24) {
      return { error: 'Allowed hours must be whole hours between 0 and 24.' };
    }
    hours = [start, end];
  }
  const priority = Number(draft.priority);
  if (!Number.isInteger(priority)) return { error: 'Priority must be an integer.' };
  return {
    value: {
      id: draft.id.trim(),
      name: draft.name.trim(),
      description: draft.description,
      effect: draft.effect,
      priority,
      subjects: splitList(draft.subjects),
      capabilities: splitList(draft.capabilities),
      resources: splitList(draft.resources),
      actions: splitList(draft.actions),
      enabled: draft.enabled,
      conditions: {
        require_purpose: draft.require_purpose,
        direct_authority_only: draft.direct_authority_only,
        max_risk_score: risk,
        max_delegation_hops: hops === null ? null : Math.floor(hops),
        allowed_hours_utc: hours,
      },
    },
  };
}

export function PolicyFormDialog({
  open,
  policy,
  onClose,
  onSaved,
}: {
  open: boolean;
  policy: Policy | null;
  onClose: () => void;
  onSaved: (policy: Policy) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(policy ?? undefined));
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useMutation((input: PolicyInput) => (policy ? api.updatePolicy(policy.id, input) : api.createPolicy(input)));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const { value, error } = fromDraft(draft);
    if (!value) {
      setFormError(error ?? 'Invalid policy.');
      return;
    }
    setFormError(null);
    const saved = await mutation.run(value);
    if (saved) onSaved(saved);
  }

  const listHint = 'Comma-separated. Empty = any.';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={policy ? `Edit policy · v${policy.version}` : 'New policy'}
      description="Policies constrain how existing authority may be used; they never create authority. Explicit deny > approval > allow > default deny."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="ID" required className="sm:col-span-1">
            {(id) => <Input id={id} required disabled={Boolean(policy)} value={draft.id} onChange={(event) => set('id', event.target.value)} placeholder="pol-…" />}
          </Field>
          <Field label="Name" required className="sm:col-span-3">
            {(id) => <Input id={id} required value={draft.name} onChange={(event) => set('name', event.target.value)} />}
          </Field>
          <Field label="Description" className="sm:col-span-4">
            {(id) => <Textarea id={id} className="min-h-[56px]" value={draft.description} onChange={(event) => set('description', event.target.value)} />}
          </Field>
          <Field label="Effect" required>
            {(id) => (
              <Select id={id} value={draft.effect} onChange={(event) => set('effect', event.target.value as PolicyEffect)}>
                <option value="allow">Allow</option>
                <option value="require_approval">Require approval</option>
                <option value="deny">Deny</option>
              </Select>
            )}
          </Field>
          <Field label="Priority" hint="Lower = evaluated first">
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="number" value={draft.priority} onChange={(event) => set('priority', event.target.value)} />}
          </Field>
          <div className="flex items-end pb-2 sm:col-span-2">
            <Checkbox label="Enabled" checked={draft.enabled} onChange={(event) => set('enabled', event.target.checked)} />
          </div>
        </div>
        <fieldset className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-2">
          <legend className="px-1 text-xs font-semibold text-fg-2">Match</legend>
          <Field label="Subjects (principal ids)" hint={listHint}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={draft.subjects} onChange={(event) => set('subjects', event.target.value)} />}
          </Field>
          <Field label="Capabilities" hint={listHint}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={draft.capabilities} onChange={(event) => set('capabilities', event.target.value)} />}
          </Field>
          <Field label="Resources" hint="Comma-separated; shell wildcards allowed, e.g. file:///hr/*">
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} className="font-mono text-xs" value={draft.resources} onChange={(event) => set('resources', event.target.value)} />}
          </Field>
          <Field label="Actions" hint={listHint}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={draft.actions} onChange={(event) => set('actions', event.target.value)} />}
          </Field>
        </fieldset>
        <fieldset className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-2">
          <legend className="px-1 text-xs font-semibold text-fg-2">Conditions (must hold for allow / approval to apply)</legend>
          <Checkbox label="Require purpose" description="The request must declare a purpose." checked={draft.require_purpose} onChange={(event) => set('require_purpose', event.target.checked)} />
          <Checkbox label="Direct authority only" description="Delegated authority does not satisfy this policy." checked={draft.direct_authority_only} onChange={(event) => set('direct_authority_only', event.target.checked)} />
          <Field label="Max risk score (0–100)">
            {(id) => <Input id={id} type="number" min={0} max={100} step="any" value={draft.max_risk_score} onChange={(event) => set('max_risk_score', event.target.value)} />}
          </Field>
          <Field label="Max delegation hops">
            {(id) => <Input id={id} type="number" min={0} value={draft.max_delegation_hops} onChange={(event) => set('max_delegation_hops', event.target.value)} />}
          </Field>
          <Field label="Allowed hours (UTC) start" hint="[start, end) — leave both empty for any time">
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="number" min={0} max={24} value={draft.hours_start} onChange={(event) => set('hours_start', event.target.value)} />}
          </Field>
          <Field label="Allowed hours (UTC) end">
            {(id) => <Input id={id} type="number" min={0} max={24} value={draft.hours_end} onChange={(event) => set('hours_end', event.target.value)} />}
          </Field>
        </fieldset>
        {formError ? <MutationError error={new Error(formError)} /> : null}
        <MutationError error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={mutation.pending}>
            {policy ? 'Save new version' : 'Create policy'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
