'use client';

import { Bot, Plus, RefreshCw, User } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { RegisterPrincipalDialog } from '@/components/agents/RegisterPrincipalDialog';
import { StatusBadge } from '@/components/governance/badges';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { PageHeader, Segmented } from '@/components/ui/Page';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { Table, TableWrap, Td, Th, THead } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useSession } from '@/lib/session';

type KindFilter = 'agent' | 'user' | 'all';

export default function AgentsPage() {
  const { can } = useSession();
  const principals = useAsync(() => api.principals(), []);
  const [kind, setKind] = useState<KindFilter>('agent');
  const [query, setQuery] = useState('');
  const [registering, setRegistering] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (principals.data ?? [])
      .filter((principal) => kind === 'all' || principal.kind === kind)
      .filter(
        (principal) =>
          !q ||
          principal.id.toLowerCase().includes(q) ||
          principal.name.toLowerCase().includes(q) ||
          principal.capabilities.some((capability) => capability.includes(q)),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [principals.data, kind, query]);

  return (
    <>
      <PageHeader
        title="Agents & principals"
        icon={<Bot className="size-5" />}
        description="Registered identities. Technical capabilities describe what an agent can drive; authority comes only from grants and delegations."
        actions={
          <>
            <Button size="sm" onClick={principals.reload} icon={<RefreshCw className="size-3.5" />}>
              Refresh
            </Button>
            {can('principals.manage') ? (
              <Button size="sm" variant="primary" onClick={() => setRegistering(true)} icon={<Plus className="size-3.5" />}>
                Register principal
              </Button>
            ) : null}
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <Segmented<KindFilter>
            label="Principal kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'agent', label: 'Agents' },
              { value: 'user', label: 'Users' },
              { value: 'all', label: 'All' },
            ]}
          />
          <Input
            aria-label="Search principals"
            placeholder="Search id, name or capability…"
            className="max-w-xs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {principals.error ? (
          <ErrorState error={principals.error} onRetry={principals.reload} />
        ) : principals.loading && !principals.data ? (
          <LoadingBlock rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState title="No principals match" />
        ) : (
          <TableWrap>
            <Table>
              <caption className="sr-only">Principals</caption>
              <THead>
                <tr>
                  <Th>Principal</Th>
                  <Th>Kind</Th>
                  <Th>Owner</Th>
                  <Th>Status</Th>
                  <Th>Technical capabilities</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((principal) => (
                  <tr key={principal.id} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/agents/${encodeURIComponent(principal.id)}`} className="font-medium text-accent hover:underline">
                        {principal.name}
                      </Link>
                      <p className="font-mono text-[11px] text-muted">{principal.id}</p>
                      {principal.description ? <p className="mt-0.5 max-w-sm text-xs text-fg-2">{principal.description}</p> : null}
                    </Td>
                    <Td>
                      <Badge tone={principal.kind === 'agent' ? 'accent' : 'info'} icon={principal.kind === 'agent' ? <Bot className="size-3" aria-hidden /> : <User className="size-3" aria-hidden />}>
                        {principal.kind}
                      </Badge>
                    </Td>
                    <Td className="font-mono text-xs">{principal.owner_id ?? '—'}</Td>
                    <Td>
                      <StatusBadge status={principal.status} />
                    </Td>
                    <Td>
                      <div className="flex max-w-md flex-wrap gap-1">
                        {principal.capabilities.length ? (
                          principal.capabilities.map((capability) => (
                            <Badge key={capability} mono>
                              {capability}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
      <RegisterPrincipalDialog
        open={registering}
        onClose={() => setRegistering(false)}
        principals={principals.data ?? []}
        onCreated={principals.reload}
      />
    </>
  );
}
