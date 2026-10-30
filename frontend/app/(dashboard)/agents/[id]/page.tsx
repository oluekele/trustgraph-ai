'use client';

import { ArrowLeft, Ban, CheckCircle2, KeyRound, Plus, Power, RefreshCw, ShieldOff } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AgentConsole } from '@/components/agents/AgentConsole';
import { AuthorityTable, CapabilityAuthorityMatrix } from '@/components/agents/AuthorityTable';
import { GrantDialog } from '@/components/agents/GrantDialog';
import { DelegationTable } from '@/components/delegations/DelegationTable';
import { StatusBadge } from '@/components/governance/badges';
import { Badge, Code } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DescList, PageHeader } from '@/components/ui/Page';
import { Alert, EmptyState, ErrorState, LoadingBlock, MutationError } from '@/components/ui/States';
import { Table, TableWrap, Td, Th, THead } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAsync, useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { PrincipalStatus } from '@/lib/types';

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { can } = useSession();
  const detail = useAsync(() => api.principal(id), [id]);
  const tools = useAsync(() => api.tools(), []);
  const [granting, setGranting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const statusMutation = useMutation(api.setPrincipalStatus);
  const revokeMutation = useMutation(api.revokeGrant);

  async function setStatus(status: PrincipalStatus) {
    if (status !== 'active' && !window.confirm(`Set ${id} to ${status}? Its requests will be denied immediately.`)) return;
    const result = await statusMutation.run(id, status);
    if (result) {
      setNotice(`Status set to ${result.status}.`);
      detail.reload();
    }
  }

  async function revokeGrant(grantId: string) {
    if (!window.confirm(`Revoke grant ${grantId}? Delegations derived from it are revoked in cascade.`)) return;
    const result = await revokeMutation.run(grantId);
    if (result) {
      setNotice(
        result.cascaded_delegations.length
          ? `Grant revoked. Cascaded revocations: ${result.cascaded_delegations.join(', ')}.`
          : 'Grant revoked. No dependent delegations.',
      );
      detail.reload();
    }
  }

  if (detail.error) {
    return (
      <Card>
        <ErrorState error={detail.error} onRetry={detail.reload} />
      </Card>
    );
  }
  if (!detail.data) return <LoadingBlock rows={10} label="Loading principal" />;

  const { principal, authority, grants, delegations, owned_agents } = detail.data;
  const isAgent = principal.kind === 'agent';
  const incoming = delegations.filter((delegation) => delegation.delegatee_id === principal.id);
  const outgoing = delegations.filter((delegation) => delegation.delegator_id === principal.id);

  return (
    <>
      <Link href="/agents" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> All principals
      </Link>
      <PageHeader
        title={principal.name}
        description={principal.description || undefined}
        actions={
          <>
            <Button size="sm" onClick={detail.reload} loading={detail.loading} icon={<RefreshCw className="size-3.5" />}>
              Refresh
            </Button>
            {can('principals.manage') ? (
              principal.status === 'active' ? (
                <>
                  <Button size="sm" variant="danger" loading={statusMutation.pending} onClick={() => setStatus('suspended')} icon={<Ban className="size-3.5" />}>
                    Suspend
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus('decommissioned')} icon={<Power className="size-3.5" />}>
                    Decommission
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="success" loading={statusMutation.pending} onClick={() => setStatus('active')} icon={<CheckCircle2 className="size-3.5" />}>
                  Activate
                </Button>
              )
            ) : null}
          </>
        }
      />
      <div className="flex flex-col gap-5">
        {notice ? (
          <Alert tone="success" action={<Button size="sm" variant="ghost" onClick={() => setNotice(null)}>Dismiss</Button>}>
            {notice}
          </Alert>
        ) : null}
        <MutationError error={statusMutation.error ?? revokeMutation.error} />

        <div className="grid gap-5 xl:grid-cols-3">
          <Card>
            <CardHeader title="Identity" />
            <CardBody>
              <DescList
                items={[
                  ['ID', <Code key="id">{principal.id}</Code>],
                  ['Kind', principal.kind],
                  ['Status', <StatusBadge key="s" status={principal.status} />],
                  ['Owner', principal.owner_id ?? '—'],
                  ['Parent agent', principal.parent_agent_id ?? '—'],
                  ['Registered', formatDate(principal.created_at)],
                  ['Owned agents', owned_agents.length ? owned_agents.join(', ') : '—'],
                ]}
              />
              {principal.status !== 'active' ? (
                <Alert tone="warning" className="mt-4" title={`Principal is ${principal.status}`}>
                  All authorisation requests from this identity are denied at the identity step.
                </Alert>
              ) : null}
            </CardBody>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader
              title="Technical capabilities vs authority"
              description="Capability is what the agent can technically do; authority is what it is permitted to do."
            />
            <CapabilityAuthorityMatrix capabilities={principal.capabilities} authority={authority} />
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Effective authority"
            description="Reconstructed on demand from direct grants and currently valid delegation chains."
            icon={<KeyRound className="size-4" />}
            actions={<Badge tone="neutral">{authority.permissions.length} permissions</Badge>}
          />
          <AuthorityTable authority={authority} />
        </Card>

        <Card>
          <CardHeader
            title="Direct grants"
            description="Root authority assigned by an administrator."
            actions={
              can('grants.manage') ? (
                <Button size="sm" variant="primary" onClick={() => setGranting(true)} icon={<Plus className="size-3.5" />}>
                  Add grant
                </Button>
              ) : null
            }
          />
          {grants.length ? (
            <TableWrap>
              <Table>
                <caption className="sr-only">Direct grants</caption>
                <THead>
                  <tr>
                    <Th>Grant</Th>
                    <Th>Permission</Th>
                    <Th className="text-right">Max delegation depth</Th>
                    <Th>Granted</Th>
                    <Th>Status</Th>
                    {can('grants.manage') ? <Th className="text-right">Actions</Th> : null}
                  </tr>
                </THead>
                <tbody>
                  {grants.map((grant) => (
                    <tr key={grant.id}>
                      <Td><Code>{grant.id}</Code></Td>
                      <Td className="text-xs">
                        <span className="font-medium">{grant.capability}</span> · <span className="font-mono">{grant.resource}</span> · {grant.action}
                      </Td>
                      <Td className="text-right tabular-nums">{grant.max_delegation_depth}</Td>
                      <Td className="text-xs">
                        {formatDate(grant.created_at)}
                        <span className="block text-muted">by {grant.granted_by}</span>
                      </Td>
                      <Td>
                        <StatusBadge status={grant.revoked_at ? 'revoked' : grant.expires_at && new Date(grant.expires_at) < new Date() ? 'expired' : 'active'} />
                      </Td>
                      {can('grants.manage') ? (
                        <Td className="text-right">
                          {!grant.revoked_at ? (
                            <Button size="sm" variant="danger" onClick={() => revokeGrant(grant.id)} icon={<ShieldOff className="size-3.5" />}>
                              Revoke
                            </Button>
                          ) : null}
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          ) : (
            <EmptyState title="No direct grants" description={isAgent ? 'Agents normally receive authority through delegation.' : undefined} />
          )}
        </Card>

        <div className="grid gap-5 2xl:grid-cols-2">
          <Card>
            <CardHeader title="Delegations received" description="Authority delegated to this principal." />
            <DelegationTable delegations={incoming} emptyText="No incoming delegations." />
          </Card>
          <Card>
            <CardHeader title="Delegations made" description="Authority this principal has delegated onward." />
            <DelegationTable delegations={outgoing} emptyText="No outgoing delegations." />
          </Card>
        </div>

        {isAgent ? (
          <AgentConsole agentId={principal.id} tools={tools.data ?? []} canRun={can('agents.run')} />
        ) : null}
      </div>
      {can('grants.manage') ? (
        <GrantDialog open={granting} principalId={principal.id} onClose={() => setGranting(false)} onCreated={detail.reload} />
      ) : null}
    </>
  );
}
