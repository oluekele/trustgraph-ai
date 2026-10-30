import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { DirectBadge } from '@/components/governance/badges';
import { PrincipalChain } from '@/components/governance/AuthorityPathView';
import { Badge, Code } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { Table, TableWrap, Td, Th, THead } from '@/components/ui/Table';
import { formatDate } from '@/lib/format';
import type { AuthoritySummary } from '@/lib/types';

/** Effective authority: every permission with each provenance path. */
export function AuthorityTable({ authority }: { authority: AuthoritySummary }) {
  if (!authority.permissions.length) {
    return (
      <EmptyState
        title="No effective authority"
        description="This principal holds no direct grants and no valid delegations. Capabilities alone confer no authority."
      />
    );
  }
  return (
    <TableWrap>
      <Table>
        <caption className="sr-only">Effective authority</caption>
        <THead>
          <tr>
            <Th>Permission</Th>
            <Th>Source</Th>
            <Th>Chain</Th>
            <Th className="text-right">Remaining depth</Th>
            <Th>Expires</Th>
          </tr>
        </THead>
        <tbody>
          {authority.permissions.flatMap((entry) =>
            entry.paths.map((path, index) => (
              <tr key={`${entry.permission.capability}|${entry.permission.resource}|${entry.permission.action}|${index}`}>
                <Td>
                  {index === 0 ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{entry.permission.capability}</span>
                      <span className="text-xs text-muted">
                        <Code>{entry.permission.resource}</Code> · {entry.permission.action}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted">↳ alternative path</span>
                  )}
                </Td>
                <Td>
                  <DirectBadge direct={path.chain.length === 0} hops={path.chain.length} />
                </Td>
                <Td>
                  <PrincipalChain principals={path.principals} delegations={path.chain} />
                </Td>
                <Td className="text-right tabular-nums">
                  {path.remaining_depth}
                  {path.remaining_depth >= 1 ? (
                    <Badge tone="accent" className="ml-1.5">delegable</Badge>
                  ) : null}
                </Td>
                <Td className="text-xs whitespace-nowrap">{path.expires_at ? formatDate(path.expires_at) : 'Never'}</Td>
              </tr>
            )),
          )}
        </tbody>
      </Table>
    </TableWrap>
  );
}

/** Technical capabilities (what the agent can drive) vs authority (what it may do). */
export function CapabilityAuthorityMatrix({
  capabilities,
  authority,
}: {
  capabilities: string[];
  authority: AuthoritySummary;
}) {
  const byCapability = new Map<string, number>();
  for (const entry of authority.permissions) {
    byCapability.set(entry.permission.capability, (byCapability.get(entry.permission.capability) ?? 0) + 1);
  }
  const all = Array.from(new Set([...capabilities, ...byCapability.keys()])).sort();
  if (!all.length) return <p className="text-xs text-muted">No capabilities registered.</p>;
  return (
    <TableWrap>
      <Table>
        <caption className="sr-only">Technical capabilities versus effective authority</caption>
        <THead>
          <tr>
            <Th>Capability</Th>
            <Th>Technical capability</Th>
            <Th>Authorised permissions</Th>
          </tr>
        </THead>
        <tbody>
          {all.map((capability) => {
            const technical = capabilities.includes(capability);
            const count = byCapability.get(capability) ?? 0;
            return (
              <tr key={capability}>
                <Td className="font-mono text-xs">{capability}</Td>
                <Td>
                  {technical ? (
                    <Badge tone="info" icon={<CheckCircle2 className="size-3" aria-hidden />}>Held</Badge>
                  ) : (
                    <Badge tone="restrict" icon={<AlertTriangle className="size-3" aria-hidden />} title="Authority exists but the agent cannot drive this capability; requests will be denied.">
                      Not held
                    </Badge>
                  )}
                </Td>
                <Td>
                  {count ? (
                    <span className="tabular-nums">{count} permission{count === 1 ? '' : 's'}</span>
                  ) : (
                    <span className="text-xs text-muted">None — capability does not imply authority</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}
