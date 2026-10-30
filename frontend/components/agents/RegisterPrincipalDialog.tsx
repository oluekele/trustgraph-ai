'use client';

import { type FormEvent, useState } from 'react';
import { Code } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert, MutationError } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useAsync, useMutation } from '@/lib/hooks';
import type { Principal, PrincipalKind } from '@/lib/types';

export function RegisterPrincipalDialog({
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
  const capabilities = useAsync(() => api.capabilities(), [], open);
  const [kind, setKind] = useState<PrincipalKind>('agent');
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [parent, setParent] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const mutation = useMutation(api.createPrincipal);

  const users = principals.filter((principal) => principal.kind === 'user');
  const agents = principals.filter((principal) => principal.kind === 'agent');

  function close() {
    setApiKey(null);
    setId('');
    setName('');
    setDescription('');
    setSelected([]);
    mutation.reset();
    onClose();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await mutation.run({
      id: id.trim(),
      kind,
      name: name.trim(),
      description,
      owner_id: owner || null,
      parent_agent_id: kind === 'agent' ? parent || null : null,
      capabilities: kind === 'agent' ? selected : [],
    });
    if (result) {
      onCreated();
      if (result.api_key) setApiKey(result.api_key);
      else close();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Register principal"
      description="Identity only: a new agent receives technical capabilities but no authority."
      size="md"
    >
      {apiKey ? (
        <div className="flex flex-col gap-3">
          <Alert tone="success" title="Principal registered">
            Copy the agent API key now — it is shown only once.
          </Alert>
          <Code className="block p-2 text-[12px]">{apiKey}</Code>
          <div className="flex justify-end">
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Kind">
            {(fid) => (
              <Select id={fid} value={kind} onChange={(event) => setKind(event.target.value as PrincipalKind)}>
                <option value="agent">Agent</option>
                <option value="user">User</option>
              </Select>
            )}
          </Field>
          <Field label="ID" required hint="Lowercase, e.g. agent-billing">
            {(fid, describedBy) => (
              <Input id={fid} aria-describedby={describedBy} required pattern="^[a-z0-9][a-z0-9._-]{1,62}$" value={id} onChange={(event) => setId(event.target.value)} />
            )}
          </Field>
          <Field label="Name" required className="sm:col-span-2">
            {(fid) => <Input id={fid} required value={name} onChange={(event) => setName(event.target.value)} />}
          </Field>
          <Field label="Description" className="sm:col-span-2">
            {(fid) => <Textarea id={fid} value={description} onChange={(event) => setDescription(event.target.value)} />}
          </Field>
          <Field label="Owner">
            {(fid) => (
              <Select id={fid} value={owner} onChange={(event) => setOwner(event.target.value)}>
                <option value="">None</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.id} — {user.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {kind === 'agent' ? (
            <Field label="Parent agent">
              {(fid) => (
                <Select id={fid} value={parent} onChange={(event) => setParent(event.target.value)}>
                  <option value="">None</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.id}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          {kind === 'agent' ? (
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-xs font-medium text-fg-2">Technical capabilities</legend>
              <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-md border border-line p-2 sm:grid-cols-2">
                {(capabilities.data ?? []).map((capability) => (
                  <Checkbox
                    key={capability.name}
                    label={<span className="font-mono text-xs">{capability.name}</span>}
                    checked={selected.includes(capability.name)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked ? [...current, capability.name] : current.filter((item) => item !== capability.name),
                      )
                    }
                  />
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="sm:col-span-2">
            <MutationError error={mutation.error} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" loading={mutation.pending}>
              Register
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
