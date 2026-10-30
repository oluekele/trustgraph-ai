'use client';

import { Network, RefreshCw, RotateCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { GraphCanvas, NODE_COLOR } from '@/components/graph/GraphCanvas';
import { Neo4jChains } from '@/components/graph/Neo4jChains';
import { NodePanel } from '@/components/graph/NodePanel';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Checkbox, Field, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/Page';
import { Alert, ErrorState, LoadingBlock, MutationError } from '@/components/ui/States';
import { api } from '@/lib/api';
import { layoutGraph } from '@/lib/graphLayout';
import { useAsync, useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { AuthoritySummary, GraphEdge, GraphEdgeType, GraphNodeType } from '@/lib/types';

const NODE_TYPES: GraphNodeType[] = ['User', 'Delegation', 'Agent', 'AuthorityGrant', 'Resource', 'Capability'];

function highlightFor(agentId: string, authority: AuthoritySummary): Set<string> {
  const set = new Set<string>([agentId]);
  for (const entry of authority.permissions) {
    set.add(`res:${entry.permission.resource}`);
    for (const path of entry.paths) {
      path.principals.forEach((principal) => set.add(principal));
      path.chain.forEach((delegation) => set.add(`dlg:${delegation}`));
      set.add(`grant:${path.root_grant_id}`);
    }
  }
  return set;
}

export default function GraphPage() {
  const { can } = useSession();
  const graph = useAsync(() => api.graph(50), []);
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [showGrants, setShowGrants] = useState(false);
  const [showOwnership, setShowOwnership] = useState(false);
  const [showActivity, setShowActivity] = useState(true);
  const [agentFilter, setAgentFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const authority = useAsync(() => api.authority(agentFilter), [agentFilter], Boolean(agentFilter));
  const sync = useMutation(api.syncGraph);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const hiddenEdgeTypes = useMemo(() => {
    const hidden = new Set<GraphEdgeType>();
    if (!showCapabilities) hidden.add('HAS_CAPABILITY');
    if (!showGrants) hidden.add('GRANTS');
    if (!showOwnership) hidden.add('OWNS');
    if (!showActivity) {
      hidden.add('EXECUTED');
      hidden.add('BLOCKED');
    }
    return hidden;
  }, [showCapabilities, showGrants, showOwnership, showActivity]);

  const nodes = graph.data?.nodes;
  const edges: GraphEdge[] = useMemo(() => (graph.data?.edges ?? []).filter((edge) => !hiddenEdgeTypes.has(edge.type)), [graph.data, hiddenEdgeTypes]);
  const layout = useMemo(() => layoutGraph(nodes ?? [], edges, showCapabilities), [nodes, edges, showCapabilities]);
  const nodesById = useMemo(() => new Map((nodes ?? []).map((node) => [node.id, node])), [nodes]);
  const visibleEdges = useMemo(() => edges.filter((edge) => layout.byId.has(edge.source) && layout.byId.has(edge.target)), [edges, layout]);
  const agents = (nodes ?? []).filter((node) => node.type === 'Agent').sort((a, b) => a.id.localeCompare(b.id));

  const highlight = useMemo(() => {
    if (!agentFilter || !authority.data || authority.data.principal_id !== agentFilter) return null;
    return highlightFor(agentFilter, authority.data);
  }, [agentFilter, authority.data]);

  const selectedNode = selectedId ? nodesById.get(selectedId) : undefined;

  return (
    <>
      <PageHeader
        title="Authority graph"
        icon={<Network className="size-5" />}
        description="Who holds what authority, and through which chain. Built from the authoritative store; dashed edges are revoked or expired."
        actions={
          <>
            <Button size="sm" onClick={graph.reload} loading={graph.loading} icon={<RefreshCw className="size-3.5" />}>
              Refresh
            </Button>
            {can('graph.sync') ? (
              <Button
                size="sm"
                loading={sync.pending}
                icon={<RotateCw className="size-3.5" />}
                onClick={async () => {
                  const result = await sync.run();
                  if (result) setSyncMessage(result.synced ? `Neo4j synced${result.counts ? `: ${Object.entries(result.counts).map(([key, value]) => `${value} ${key}`).join(', ')}` : ''}.` : `Sync failed: ${result.error ?? 'unknown error'}`);
                }}
              >
                Sync Neo4j
              </Button>
            ) : null}
          </>
        }
      />
      <div className="flex flex-col gap-4">
        {sync.error ? <MutationError error={sync.error} /> : null}
        {syncMessage ? (
          <Alert tone="info" action={<Button size="sm" variant="ghost" onClick={() => setSyncMessage(null)}>Dismiss</Button>}>
            {syncMessage}
          </Alert>
        ) : null}
        <Card>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-line p-3">
            <Field label="Highlight agent's authority chains" className="w-64">
              {(id) => (
                <Select
                  id={id}
                  value={agentFilter}
                  onChange={(event) => {
                    setAgentFilter(event.target.value);
                    setSelectedId(event.target.value || null);
                  }}
                >
                  <option value="">None</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.id}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Checkbox label="Capabilities" checked={showCapabilities} onChange={(event) => setShowCapabilities(event.target.checked)} />
            <Checkbox label="Delegated grants" checked={showGrants} onChange={(event) => setShowGrants(event.target.checked)} />
            <Checkbox label="Ownership" checked={showOwnership} onChange={(event) => setShowOwnership(event.target.checked)} />
            <Checkbox label="Recent activity" checked={showActivity} onChange={(event) => setShowActivity(event.target.checked)} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-3 py-2 text-[11px] text-muted" aria-label="Legend">
            {NODE_TYPES.filter((type) => type !== 'Capability' || showCapabilities).map((type) => (
              <span key={type} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: NODE_COLOR[type] }} aria-hidden />
                {type === 'AuthorityGrant' ? 'Direct grant' : type}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="var(--allow)" strokeWidth="2" /></svg> executed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="var(--deny)" strokeWidth="2" /></svg> blocked
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="var(--muted)" strokeWidth="2" strokeDasharray="5 4" /></svg> revoked / expired
            </span>
          </div>
          <div className="grid lg:grid-cols-[1fr_300px]">
            <div className="h-[68vh] min-h-[480px]">
              {graph.error ? (
                <ErrorState error={graph.error} onRetry={graph.reload} />
              ) : !graph.data ? (
                <LoadingBlock rows={10} label="Loading graph" />
              ) : (
                <GraphCanvas layout={layout} edges={visibleEdges} selectedId={selectedId} onSelect={setSelectedId} highlight={highlight} />
              )}
            </div>
            <aside className="border-t border-line p-4 lg:border-t-0 lg:border-l" aria-label="Node details">
              {selectedNode ? (
                <NodePanel node={selectedNode} edges={graph.data?.edges ?? []} nodesById={nodesById} onSelect={setSelectedId} />
              ) : (
                <p className="text-xs text-muted">
                  Select a node to inspect it. Choose an agent above to highlight every chain from a human root to that agent.
                </p>
              )}
              {authority.error && agentFilter ? <MutationError error={authority.error} /> : null}
            </aside>
          </div>
        </Card>
        {agentFilter ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Neo4jChains agentId={agentFilter} />
            <Card>
              <CardHeader title="Chains from the authoritative store" description="Reconstructed effective authority paths for this agent." />
              <CardBody>
                {authority.data && authority.data.principal_id === agentFilter ? (
                  authority.data.permissions.length ? (
                    <ul className="flex flex-col gap-1 text-xs">
                      {Array.from(
                        new Set(authority.data.permissions.flatMap((entry) => entry.paths.map((path) => `${path.principals.join(' → ')}${path.chain.length ? `  [${path.chain.join(', ')}]` : ''}`))),
                      ).map((line) => (
                        <li key={line} className="font-mono">{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted">This agent holds no authority.</p>
                  )
                ) : (
                  <LoadingBlock rows={3} />
                )}
              </CardBody>
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
