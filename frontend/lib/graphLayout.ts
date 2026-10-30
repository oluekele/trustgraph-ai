import type { GraphEdge, GraphNode, GraphNodeType } from './types';

export const NODE_W = 176;
export const NODE_H = 28;
export const COL_GAP = 96;
export const ROW_GAP = 12;

export const COLUMN_OF: Record<GraphNodeType, number> = {
  User: 0,
  Delegation: 1,
  Agent: 2,
  AuthorityGrant: 3,
  Resource: 4,
  Capability: 5,
};

export const COLUMN_TITLES = ['Users', 'Delegations', 'Agents', 'Direct grants', 'Resources', 'Capabilities'];

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  column: number;
}

export interface Layout {
  nodes: PositionedNode[];
  byId: Map<string, PositionedNode>;
  width: number;
  height: number;
  columns: { index: number; x: number; title: string; count: number }[];
}

/**
 * Deterministic layered layout: one column per node type, ordered left to
 * right along the direction authority flows; within a column, nodes are
 * ordered by the barycentre of their already-placed neighbours (ties by id)
 * to reduce edge crossings.
 */
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], includeCapabilities: boolean): Layout {
  const visible = nodes.filter((node) => includeCapabilities || node.type !== 'Capability');
  const columns = new Map<number, GraphNode[]>();
  for (const node of visible) {
    const column = COLUMN_OF[node.type] ?? 5;
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column)?.push(node);
  }

  const neighbours = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!neighbours.has(edge.source)) neighbours.set(edge.source, new Set());
    if (!neighbours.has(edge.target)) neighbours.set(edge.target, new Set());
    neighbours.get(edge.source)?.add(edge.target);
    neighbours.get(edge.target)?.add(edge.source);
  }

  const rank = new Map<string, number>();
  const order = [0, 1, 2, 3, 4, 5].filter((column) => columns.has(column));
  for (const column of order) {
    const list = columns.get(column) ?? [];
    const key = (node: GraphNode): number => {
      const placed = Array.from(neighbours.get(node.id) ?? []).map((id) => rank.get(id)).filter((value): value is number => value !== undefined);
      if (!placed.length) return Number.POSITIVE_INFINITY;
      return placed.reduce((sum, value) => sum + value, 0) / placed.length;
    };
    const keyed = list.map((node) => ({ node, key: column === 0 ? 0 : key(node) }));
    keyed.sort((a, b) => a.key - b.key || (a.node.depth ?? 0) - (b.node.depth ?? 0) || a.node.id.localeCompare(b.node.id));
    keyed.forEach(({ node }, index) => rank.set(node.id, index));
    columns.set(column, keyed.map(({ node }) => node));
  }

  const tallest = Math.max(1, ...Array.from(columns.values()).map((list) => list.length));
  const height = tallest * (NODE_H + ROW_GAP) - ROW_GAP;
  const positioned: PositionedNode[] = [];
  const columnInfo: Layout['columns'] = [];
  order.forEach((column, visualIndex) => {
    const list = columns.get(column) ?? [];
    const offset = ((tallest - list.length) * (NODE_H + ROW_GAP)) / 2;
    const x = visualIndex * (NODE_W + COL_GAP);
    columnInfo.push({ index: column, x, title: COLUMN_TITLES[column], count: list.length });
    list.forEach((node, index) => {
      positioned.push({ ...node, column: visualIndex, x, y: offset + index * (NODE_H + ROW_GAP) });
    });
  });

  return {
    nodes: positioned,
    byId: new Map(positioned.map((node) => [node.id, node])),
    width: Math.max(1, order.length) * (NODE_W + COL_GAP) - COL_GAP,
    height,
    columns: columnInfo,
  };
}

/** Cubic path between two nodes, routing by relative column. */
export function edgePath(source: PositionedNode, target: PositionedNode): string {
  const sy = source.y + NODE_H / 2;
  const ty = target.y + NODE_H / 2;
  if (source.column === target.column) {
    const x = source.x + NODE_W;
    const bulge = 40 + Math.min(80, Math.abs(ty - sy) / 4);
    return `M ${x} ${sy} C ${x + bulge} ${sy}, ${x + bulge} ${ty}, ${x} ${ty}`;
  }
  const forward = target.column > source.column;
  const sx = forward ? source.x + NODE_W : source.x;
  const tx = forward ? target.x : target.x + NODE_W;
  const dx = Math.max(40, Math.abs(tx - sx) / 2);
  const c1 = forward ? sx + dx : sx - dx;
  const c2 = forward ? tx - dx : tx + dx;
  return `M ${sx} ${sy} C ${c1} ${sy}, ${c2} ${ty}, ${tx} ${ty}`;
}
