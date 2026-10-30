'use client';

import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/governance/badges';
import { Badge, Code } from '@/components/ui/Badge';
import { DescList } from '@/components/ui/Page';
import type { GraphEdge, GraphNode } from '@/lib/types';
import { NODE_COLOR } from './GraphCanvas';

export function NodePanel({
  node,
  edges,
  nodesById,
  onSelect,
}: {
  node: GraphNode;
  edges: GraphEdge[];
  nodesById: Map<string, GraphNode>;
  onSelect: (id: string) => void;
}) {
  const outgoing = edges.filter((edge) => edge.source === node.id);
  const incoming = edges.filter((edge) => edge.target === node.id);
  const extra = Object.entries(node).filter(([key]) => !['id', 'type', 'label', 'status'].includes(key));

  const edgeRow = (edge: GraphEdge, other: string, direction: 'in' | 'out', index: number) => {
    const target = nodesById.get(other);
    return (
      <li key={`${direction}-${other}-${edge.type}-${index}`}>
        <button
          type="button"
          onClick={() => onSelect(other)}
          className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-surface-2"
        >
          {direction === 'out' ? <ArrowRight className="size-3 shrink-0 text-muted" aria-hidden /> : <ArrowLeft className="size-3 shrink-0 text-muted" aria-hidden />}
          <span className="shrink-0 font-mono text-[10.5px] text-muted">{edge.type}</span>
          <span className="truncate">{target?.label ?? other}</span>
          {edge.status && edge.status !== 'active' ? <StatusBadge status={edge.status} /> : null}
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-sm" style={{ background: NODE_COLOR[node.type] }} aria-hidden />
          <Badge>{node.type}</Badge>
          {node.status ? <StatusBadge status={node.status} /> : null}
        </div>
        <p className="mt-2 text-sm font-semibold break-words">{node.label}</p>
        <Code className="mt-1 inline-block">{node.id}</Code>
      </div>
      {extra.length ? <DescList items={extra.map(([key, value]) => [key, String(value)])} /> : null}
      {node.type === 'Agent' || node.type === 'User' ? (
        <Link href={`/agents/${encodeURIComponent(node.id)}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
          Open principal <ExternalLink className="size-3" aria-hidden />
        </Link>
      ) : null}
      {node.type === 'Delegation' ? (
        <Link href="/delegations" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
          Manage delegations <ExternalLink className="size-3" aria-hidden />
        </Link>
      ) : null}
      <section>
        <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Outgoing ({outgoing.length})</h3>
        <ul className="max-h-48 overflow-y-auto">{outgoing.map((edge, index) => edgeRow(edge, edge.target, 'out', index))}</ul>
      </section>
      <section>
        <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Incoming ({incoming.length})</h3>
        <ul className="max-h-48 overflow-y-auto">{incoming.map((edge, index) => edgeRow(edge, edge.source, 'in', index))}</ul>
      </section>
    </div>
  );
}
