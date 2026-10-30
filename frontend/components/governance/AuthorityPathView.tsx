import { Bot, ChevronRight, KeyRound, User } from 'lucide-react';
import Link from 'next/link';
import type { AuthorityPath } from '@/lib/types';
import { Code } from '@/components/ui/Badge';
import { formatDate } from '@/lib/format';

function isAgent(id: string) {
  return id.startsWith('agent');
}

export function PrincipalChip({ id }: { id: string }) {
  const Icon = isAgent(id) ? Bot : User;
  const inner = (
    <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11.5px]">
      <Icon className="size-3 text-muted" aria-hidden />
      {id}
    </span>
  );
  return isAgent(id) ? (
    <Link href={`/agents/${encodeURIComponent(id)}`} className="hover:underline">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/** Principal chain with the delegation ids traversed between each hop. */
export function PrincipalChain({ principals, delegations = [] }: { principals: string[]; delegations?: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label={`Authority chain: ${principals.join(' to ')}`}>
      {principals.map((principal, index) => (
        <span key={`${principal}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted">
              <ChevronRight className="size-3" aria-hidden />
              {delegations[index - 1] ? <span className="font-mono">{delegations[index - 1]}</span> : null}
              {delegations[index - 1] ? <ChevronRight className="size-3" aria-hidden /> : null}
            </span>
          ) : null}
          <PrincipalChip id={principal} />
        </span>
      ))}
    </div>
  );
}

export function AuthorityPathView({ path }: { path: AuthorityPath }) {
  return (
    <div className="flex flex-col gap-2">
      <PrincipalChain principals={path.principals} delegations={path.chain} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1">
          <KeyRound className="size-3" aria-hidden /> Root grant <Code>{path.root_grant_id}</Code>
        </span>
        <span>{path.chain.length === 0 ? 'Direct authority' : `${path.chain.length}-hop delegation`}</span>
        <span>Remaining depth {path.remaining_depth}</span>
        {path.expires_at ? <span>Expires {formatDate(path.expires_at)}</span> : null}
      </div>
    </div>
  );
}
