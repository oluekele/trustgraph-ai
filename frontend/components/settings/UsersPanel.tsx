'use client';

import { Plus, Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingBlock, MutationError } from '@/components/ui/States';
import { Table, TableWrap, Td, Th, THead } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAsync, useMutation } from '@/lib/hooks';
import { ROLE_DESCRIPTIONS, ROLES } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { GatewayUser, Role, UserUpdate } from '@/lib/types';

function isActive(user: GatewayUser) {
  return user.active ?? user.isActive ?? true;
}

function CreateUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('auditor');
  const mutation = useMutation(api.createUser);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await mutation.run({ email: email.trim(), name: name.trim(), password, role })) {
      setEmail('');
      setName('');
      setPassword('');
      onCreated();
      onClose();
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create console user" size="sm">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field label="Name" required>{(id) => <Input id={id} required value={name} onChange={(event) => setName(event.target.value)} />}</Field>
        <Field label="Email" required>{(id) => <Input id={id} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />}</Field>
        <Field label="Initial password" required hint="At least 8 characters.">
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />}
        </Field>
        <Field label="Role" hint={ROLE_DESCRIPTIONS[role]}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          )}
        </Field>
        <MutationError error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={mutation.pending}>Create user</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function UsersPanel() {
  const { user: me } = useSession();
  const users = useAsync(() => api.users(), []);
  const [creating, setCreating] = useState(false);
  const update = useMutation((id: string, body: UserUpdate) => api.updateUser(id, body));

  async function patch(id: string, body: UserUpdate) {
    if (await update.run(id, body)) users.reload();
  }

  return (
    <Card>
      <CardHeader
        title="Console users"
        description="Human operators of this dashboard (managed by the gateway)."
        icon={<Users className="size-4" />}
        actions={<Button size="sm" variant="primary" onClick={() => setCreating(true)} icon={<Plus className="size-3.5" />}>New user</Button>}
      />
      <div className="px-4 pt-3">
        <MutationError error={update.error} />
      </div>
      {users.error ? (
        <ErrorState error={users.error} onRetry={users.reload} />
      ) : !users.data ? (
        <LoadingBlock rows={4} />
      ) : users.data.length === 0 ? (
        <EmptyState title="No users" />
      ) : (
        <TableWrap>
          <Table>
            <caption className="sr-only">Console users</caption>
            <THead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </THead>
            <tbody>
              {users.data.map((user) => {
                const self = user.id === me?.id;
                const active = isActive(user);
                return (
                  <tr key={user.id}>
                    <Td>
                      <p className="font-medium">{user.name}{self ? <span className="ml-1 text-xs text-muted">(you)</span> : null}</p>
                      <p className="text-xs text-muted">{user.email}</p>
                    </Td>
                    <Td>
                      <Select
                        aria-label={`Role for ${user.email}`}
                        className="w-36"
                        value={user.role}
                        disabled={self || update.pending}
                        onChange={(event) => patch(user.id, { role: event.target.value as Role })}
                      >
                        {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                      </Select>
                    </Td>
                    <Td><Badge tone={active ? 'allow' : 'neutral'}>{active ? 'active' : 'deactivated'}</Badge></Td>
                    <Td className="text-xs">{formatDate(user.createdAt)}</Td>
                    <Td className="text-right">
                      {self ? null : active ? (
                        <Button size="sm" variant="danger" onClick={() => window.confirm(`Deactivate ${user.email}?`) && patch(user.id, { active: false })}>
                          Deactivate
                        </Button>
                      ) : (
                        <Button size="sm" variant="success" onClick={() => patch(user.id, { active: true })}>
                          Reactivate
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
      <CreateUserDialog open={creating} onClose={() => setCreating(false)} onCreated={users.reload} />
    </Card>
  );
}
