'use client';

import { ArrowDown } from 'lucide-react';
import { StatusBadge } from '@/components/governance/badges';
import { PrincipalChip } from '@/components/governance/AuthorityPathView';
import { Code } from '@/components/ui/Badge';
import { cx } from '@/components/ui/cx';
import { formatDate } from '@/lib/format';
import type { Delegation, DelegationDetail } from '@/lib/types';
import { GrantList } from './DelegationTable';

function Hop({ delegation, current }: { delegation: Delegation; current: boolean }) {
  return (
    <div className={cx('rounded-md border p-3', current ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <PrincipalChip id={delegation.delegator_id} />
          <span className="text-muted">→</span>
          <PrincipalChip id={delegation.delegatee_id} />
        </div>
        <StatusBadge status={delegation.effective_status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted">
        <Code>{delegation.id}</Code>
        <span>hop {delegation.depth}</span>
        <span>re-delegate ≤ {delegation.max_redelegation_depth}</span>
        <span>expires {delegation.expires_at ? formatDate(delegation.expires_at) : 'never'}</span>
      </div>
      {delegation.purpose ? <p className="mt-1 text-xs">{delegation.purpose}</p> : null}
      <div className="mt-2">
        <GrantList delegation={delegation} limit={10} />
      </div>
      {delegation.revoked_reason ? <p className="mt-2 text-xs text-deny">Revoked: {delegation.revoked_reason}</p> : null}
    </div>
  );
}

/** Root-to-leaf chain for one delegation, plus its direct children. */
export function DelegationChainView({ detail }: { detail: DelegationDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Chain from root">
        <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">Chain from root</h3>
        <ol className="flex flex-col items-stretch">
          {detail.chain.map((delegation, index) => (
            <li key={delegation.id} className="flex flex-col items-center">
              {index > 0 ? <ArrowDown className="my-1 size-4 text-muted" aria-hidden /> : null}
              <div className="w-full">
                <Hop delegation={delegation} current={delegation.id === detail.delegation.id} />
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section aria-label="Re-delegations">
        <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
          Re-delegations ({detail.children.length})
        </h3>
        {detail.children.length ? (
          <div className="flex flex-col gap-2">
            {detail.children.map((child) => (
              <Hop key={child.id} delegation={child} current={false} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">This delegation has not been re-delegated.</p>
        )}
      </section>
    </div>
  );
}
