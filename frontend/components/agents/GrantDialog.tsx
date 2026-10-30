'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { MutationError } from '@/components/ui/States';
import { api } from '@/lib/api';
import { localInputToIso } from '@/lib/format';
import { useAsync, useMutation } from '@/lib/hooks';

/** Admin: assign direct (root) authority to a principal. */
export function GrantDialog({
  open,
  principalId,
  onClose,
  onCreated,
}: {
  open: boolean;
  principalId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const catalogue = useAsync(() => Promise.all([api.capabilities(), api.resources()]), [], open);
  const [capability, setCapability] = useState('');
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');
  const [depth, setDepth] = useState(0);
  const [expires, setExpires] = useState('');
  const mutation = useMutation(api.createGrant);

  const [capabilities, resources] = catalogue.data ?? [[], []];
  const actions = useMemo(() => {
    const allowed = resources.find((item) => item.id === resource)?.allowed_actions ?? [];
    const capActions = capabilities.find((item) => item.name === capability)?.actions ?? [];
    return capActions.length ? allowed.filter((item) => capActions.includes(item)) : allowed;
  }, [resources, capabilities, resource, capability]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await mutation.run({
      principal_id: principalId,
      capability,
      resource,
      action,
      max_delegation_depth: depth,
      expires_at: localInputToIso(expires),
    });
    if (result) {
      onCreated();
      onClose();
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Grant authority to ${principalId}`} description="Direct grants are the roots of every authority chain.">
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Capability" required>
          {(id) => (
            <Select id={id} required value={capability} onChange={(event) => setCapability(event.target.value)}>
              <option value="">Select…</option>
              {capabilities.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Resource" required>
          {(id) => (
            <Select id={id} required value={resource} onChange={(event) => setResource(event.target.value)}>
              <option value="">Select…</option>
              {resources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Action" required>
          {(id) => (
            <Select id={id} required value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="">Select…</option>
              {actions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Max delegation depth" hint="0 = may use but not delegate">
          {(id, describedBy) => (
            <Input id={id} aria-describedby={describedBy} type="number" min={0} max={10} value={depth} onChange={(event) => setDepth(Number(event.target.value))} />
          )}
        </Field>
        <Field label="Expires (optional)" className="sm:col-span-2">
          {(id) => <Input id={id} type="datetime-local" value={expires} onChange={(event) => setExpires(event.target.value)} />}
        </Field>
        <div className="sm:col-span-2">
          <MutationError error={mutation.error ?? catalogue.error} />
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={mutation.pending}>
            Create grant
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
