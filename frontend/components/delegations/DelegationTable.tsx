import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/governance/badges';
import { PrincipalChip } from '@/components/governance/AuthorityPathView';
import { Code } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { Table, TableWrap, Td, Th, THead, Tr } from '@/components/ui/Table';
import { formatDate } from '@/lib/format';
import type { Delegation } from '@/lib/types';

export function GrantList({ delegation, limit = 3 }: { delegation: Delegation; limit?: number }) {
  const shown = delegation.grants.slice(0, limit);
  return (
    <ul className="flex flex-col gap-0.5 text-xs">
      {shown.map((grant) => (
        <li key={`${grant.capability}|${grant.resource}|${grant.action}`}>
          <span className="font-medium">{grant.capability}</span> <span className="text-muted">·</span>{' '}
          <span className="font-mono text-[11px]">{grant.resource}</span> <span className="text-muted">·</span> {grant.action}
        </li>
      ))}
      {delegation.grants.length > limit ? (
        <li className="text-muted">+{delegation.grants.length - limit} more</li>
      ) : null}
    </ul>
  );
}

export function DelegationTable({
  delegations,
  onSelect,
  selectedId,
  actions,
  emptyText = 'No delegations.',
}: {
  delegations: Delegation[];
  onSelect?: (delegation: Delegation) => void;
  selectedId?: string | null;
  actions?: (delegation: Delegation) => ReactNode;
  emptyText?: string;
}) {
  if (!delegations.length) return <EmptyState title={emptyText} />;
  return (
    <TableWrap>
      <Table>
        <caption className="sr-only">Delegations</caption>
        <THead>
          <tr>
            <Th>Delegation</Th>
            <Th>Delegator → delegatee</Th>
            <Th>Grants</Th>
            <Th className="text-right">Depth</Th>
            <Th>Status</Th>
            <Th>Expires</Th>
            {actions ? <Th className="text-right">Actions</Th> : null}
          </tr>
        </THead>
        <tbody>
          {delegations.map((delegation) => (
            <Tr
              key={delegation.id}
              selected={selectedId === delegation.id}
              onClick={onSelect ? () => onSelect(delegation) : undefined}
            >
              <Td>
                <Code>{delegation.id}</Code>
                {delegation.purpose ? <p className="mt-1 text-xs text-muted">{delegation.purpose}</p> : null}
              </Td>
              <Td>
                <div className="flex flex-wrap items-center gap-1">
                  <PrincipalChip id={delegation.delegator_id} />
                  <span className="text-muted" aria-label="to">→</span>
                  <PrincipalChip id={delegation.delegatee_id} />
                </div>
              </Td>
              <Td>
                <GrantList delegation={delegation} />
              </Td>
              <Td className="text-right text-xs whitespace-nowrap tabular-nums">
                hop {delegation.depth}
                <span className="block text-muted">re-delegate ≤ {delegation.max_redelegation_depth}</span>
              </Td>
              <Td>
                <StatusBadge status={delegation.effective_status} />
              </Td>
              <Td className="text-xs whitespace-nowrap">{delegation.expires_at ? formatDate(delegation.expires_at) : 'Never'}</Td>
              {actions ? (
                <Td className="text-right" onClick={(event) => event.stopPropagation()}>
                  {actions(delegation)}
                </Td>
              ) : null}
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}
