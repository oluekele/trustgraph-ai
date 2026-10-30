'use client';

import { Maximize2, Minus, Plus } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { edgePath, type Layout, NODE_H, NODE_W } from '@/lib/graphLayout';
import type { GraphEdge, GraphEdgeType, GraphNodeType } from '@/lib/types';

export const NODE_COLOR: Record<GraphNodeType, string> = {
  User: 'var(--node-user)',
  Agent: 'var(--node-agent)',
  Delegation: 'var(--node-delegation)',
  AuthorityGrant: 'var(--node-grant)',
  Resource: 'var(--node-resource)',
  Capability: 'var(--node-capability)',
};

export const EDGE_COLOR: Partial<Record<GraphEdgeType, string>> = {
  EXECUTED: 'var(--allow)',
  BLOCKED: 'var(--deny)',
  FROM: 'var(--node-delegation)',
  DELEGATED_TO: 'var(--node-delegation)',
  HOLDS: 'var(--node-grant)',
  TARGETS: 'var(--node-grant)',
};

const PAD = 40;
const HEADER = 28;

interface Transform {
  x: number;
  y: number;
  k: number;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isInactive(status: string | undefined) {
  return status === 'revoked' || status === 'expired' || status === 'suspended' || status === 'decommissioned';
}

export function GraphCanvas({
  layout,
  edges,
  selectedId,
  onSelect,
  highlight,
}: {
  layout: Layout;
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** When set, everything else is dimmed. */
  highlight: Set<string> | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 560 });
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean; nodeId: string | null } | null>(null);

  const contentW = layout.width + PAD * 2;
  const contentH = layout.height + PAD * 2 + HEADER;

  const fit = useCallback(() => {
    const k = Math.min(1.2, Math.max(0.2, Math.min(size.width / contentW, size.height / contentH)));
    setTransform({ k, x: (size.width - contentW * k) / 2, y: Math.max(0, (size.height - contentH * k) / 2) });
  }, [size, contentW, contentH]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fit();
  }, [fit]);

  // Wheel zoom around the cursor (non-passive so the page does not scroll).
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setTransform((current) => {
        const k = Math.min(3, Math.max(0.15, current.k * Math.exp(-event.deltaY * 0.0015)));
        const ratio = k / current.k;
        return { k, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio };
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const zoom = (factor: number) =>
    setTransform((current) => {
      const k = Math.min(3, Math.max(0.15, current.k * factor));
      const cx = size.width / 2;
      const cy = size.height / 2;
      const ratio = k / current.k;
      return { k, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio };
    });

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const nodeId = (event.target as Element).closest('[data-node-id]')?.getAttribute('data-node-id') ?? null;
    drag.current = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y, moved: false, nodeId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) state.moved = true;
    if (state.moved) setTransform((current) => ({ ...current, x: state.tx + dx, y: state.ty + dy }));
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const state = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (state && !state.moved) onSelect(state.nodeId);
  }

  const neighbourhood = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    for (const edge of edges) {
      if (edge.source === selectedId) set.add(edge.target);
      if (edge.target === selectedId) set.add(edge.source);
    }
    return set;
  }, [selectedId, edges]);

  const focus = highlight ?? neighbourhood;
  const edgeVisible = (edge: GraphEdge) => !focus || (focus.has(edge.source) && focus.has(edge.target));

  return (
    <div className="relative h-full min-h-[480px] w-full overflow-hidden rounded-b-lg bg-surface-2" ref={containerRef}>
      <div className="absolute top-2 right-2 z-10 flex gap-1 rounded-md border border-line bg-surface p-1 shadow-[var(--shadow)]">
        <Button size="sm" variant="ghost" aria-label="Zoom in" onClick={() => zoom(1.25)} icon={<Plus className="size-3.5" />} />
        <Button size="sm" variant="ghost" aria-label="Zoom out" onClick={() => zoom(0.8)} icon={<Minus className="size-3.5" />} />
        <Button size="sm" variant="ghost" aria-label="Fit to view" onClick={fit} icon={<Maximize2 className="size-3.5" />} />
      </div>
      <svg
        width="100%"
        height="100%"
        className="cursor-grab touch-none select-none active:cursor-grabbing"
        role="img"
        aria-label={`Authority graph with ${layout.nodes.length} nodes and ${edges.length} edges. Drag to pan, scroll to zoom, click a node for details.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <defs>
          <marker id="tg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted)" />
          </marker>
        </defs>
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          <g transform={`translate(${PAD} ${PAD})`}>
            {layout.columns.map((column) => (
              <text key={column.index} x={column.x + NODE_W / 2} y={-8} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--muted)">
                {column.title} ({column.count})
              </text>
            ))}
            <g transform={`translate(0 ${HEADER})`}>
              <g fill="none">
                {edges.map((edge, index) => {
                  const source = layout.byId.get(edge.source);
                  const target = layout.byId.get(edge.target);
                  if (!source || !target) return null;
                  const visible = edgeVisible(edge);
                  const inactive = isInactive(edge.status);
                  return (
                    <path
                      key={`${edge.source}-${edge.target}-${edge.type}-${index}`}
                      d={edgePath(source, target)}
                      stroke={EDGE_COLOR[edge.type] ?? 'var(--border-strong)'}
                      strokeWidth={visible && focus ? 2 : 1.25}
                      strokeDasharray={inactive ? '5 4' : undefined}
                      opacity={visible ? (inactive ? 0.55 : 0.85) : 0.08}
                      markerEnd="url(#tg-arrow)"
                    >
                      <title>
                        {edge.source} —{edge.type}
                        {edge.label ? ` (${edge.label})` : ''}
                        {edge.status ? ` [${edge.status}]` : ''}→ {edge.target}
                      </title>
                    </path>
                  );
                })}
              </g>
              {layout.nodes.map((node) => {
                const dimmed = focus ? !focus.has(node.id) : false;
                const selected = node.id === selectedId;
                const inactive = isInactive(node.status);
                const color = NODE_COLOR[node.type];
                return (
                  <g
                    key={node.id}
                    data-node-id={node.id}
                    transform={`translate(${node.x} ${node.y})`}
                    opacity={dimmed ? 0.22 : 1}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    aria-label={`${node.type} ${node.label}${node.status ? `, ${node.status}` : ''}`}
                    aria-pressed={selected}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(node.id);
                      }
                    }}
                  >
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={6}
                      fill="var(--surface)"
                      stroke={selected ? 'var(--focus)' : color}
                      strokeWidth={selected ? 2.5 : 1.25}
                      strokeDasharray={inactive ? '4 3' : undefined}
                    />
                    <rect width={6} height={NODE_H} rx={3} fill={color} />
                    <text x={14} y={NODE_H / 2 + 4} fontSize={11.5} fill="var(--fg)" style={{ textDecoration: inactive ? 'line-through' : undefined }}>
                      {truncate(node.type === 'Delegation' ? node.id.replace(/^dlg:/, '') : node.label || node.id, 24)}
                    </text>
                    <title>
                      {node.type}: {node.label} ({node.id}){node.status ? ` — ${node.status}` : ''}
                    </title>
                  </g>
                );
              })}
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
