'use client';

import { Database } from 'lucide-react';
import { PrincipalChain } from '@/components/governance/AuthorityPathView';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { ApiError, api } from '@/lib/api';
import { ms } from '@/lib/format';
import { useAsync } from '@/lib/hooks';

export function Neo4jChains({ agentId }: { agentId: string }) {
  const chains = useAsync(() => api.neo4jChains(agentId), [agentId]);
  const disabled = chains.error instanceof ApiError && chains.error.status === 503;
  return (
    <Card>
      <CardHeader
        title="Neo4j chain query"
        description="Active root-to-agent chains and blast radius, computed by the Neo4j projection."
        icon={<Database className="size-4" />}
      />
      {disabled ? (
        <CardBody>
          <p className="text-[13px] font-medium">Neo4j projection disabled</p>
          <p className="mt-1 text-xs text-muted">
            The relational store remains authoritative; the graph above is built from it. {chains.error instanceof Error ? chains.error.message : ''}
          </p>
        </CardBody>
      ) : chains.error ? (
        <ErrorState error={chains.error} onRetry={chains.reload} />
      ) : !chains.data ? (
        <LoadingBlock rows={3} />
      ) : (
        <CardBody className="flex flex-col gap-3 text-[13px]">
          <p className="text-xs text-muted">
            Chains query {ms(chains.data.latency_ms.chains)} · blast radius {ms(chains.data.latency_ms.blast_radius)}
          </p>
          {chains.data.chains.length ? (
            <ul className="flex flex-col gap-2">
              {chains.data.chains.map((chain, index) => (
                <li key={index}>
                  <PrincipalChain principals={chain.principals} delegations={chain.delegations} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">No active delegation chains reach this agent.</p>
          )}
          <div>
            <p className="text-xs font-semibold text-fg-2">Dependent agents (blast radius)</p>
            <p className="text-xs">{chains.data.dependents.length ? chains.data.dependents.join(', ') : 'None'}</p>
          </div>
        </CardBody>
      )}
    </Card>
  );
}
