import {
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  Hourglass,
  ShieldAlert,
  ShieldCheck,
  ShieldMinus,
  ShieldX,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, type Tone } from '@/components/ui/Badge';
import { humanize } from '@/lib/format';

const ICON = 'size-3';

const DECISIONS: Record<string, { tone: Tone; label: string; icon: ReactNode }> = {
  allow: { tone: 'allow', label: 'Allow', icon: <ShieldCheck className={ICON} aria-hidden /> },
  restrict: { tone: 'restrict', label: 'Restrict', icon: <ShieldMinus className={ICON} aria-hidden /> },
  require_approval: { tone: 'approval', label: 'Require approval', icon: <UserCheck className={ICON} aria-hidden /> },
  deny: { tone: 'deny', label: 'Deny', icon: <ShieldX className={ICON} aria-hidden /> },
};

export function decisionTone(decision: string | null | undefined): Tone {
  return (decision && DECISIONS[decision]?.tone) || 'neutral';
}

/** Decision badge: colour + icon + text (never colour alone). */
export function DecisionBadge({ decision, className }: { decision: string | null | undefined; className?: string }) {
  if (!decision) return <span className="text-muted">—</span>;
  const meta = DECISIONS[decision] ?? { tone: 'neutral' as Tone, label: humanize(decision), icon: <CircleDot className={ICON} aria-hidden /> };
  return (
    <Badge tone={meta.tone} icon={meta.icon} className={className}>
      {meta.label}
    </Badge>
  );
}

const STATUSES: Record<string, { tone: Tone; icon: ReactNode }> = {
  active: { tone: 'allow', icon: <CheckCircle2 className={ICON} aria-hidden /> },
  executed: { tone: 'allow', icon: <CheckCircle2 className={ICON} aria-hidden /> },
  approved: { tone: 'allow', icon: <CheckCircle2 className={ICON} aria-hidden /> },
  valid: { tone: 'allow', icon: <CheckCircle2 className={ICON} aria-hidden /> },
  restricted: { tone: 'restrict', icon: <ShieldMinus className={ICON} aria-hidden /> },
  suspended: { tone: 'restrict', icon: <Ban className={ICON} aria-hidden /> },
  pending: { tone: 'approval', icon: <Hourglass className={ICON} aria-hidden /> },
  pending_approval: { tone: 'approval', icon: <Hourglass className={ICON} aria-hidden /> },
  escalated: { tone: 'approval', icon: <UserCheck className={ICON} aria-hidden /> },
  consumed: { tone: 'info', icon: <CircleDashed className={ICON} aria-hidden /> },
  expired: { tone: 'neutral', icon: <Clock className={ICON} aria-hidden /> },
  revoked: { tone: 'deny', icon: <XCircle className={ICON} aria-hidden /> },
  rejected: { tone: 'deny', icon: <XCircle className={ICON} aria-hidden /> },
  blocked: { tone: 'deny', icon: <ShieldX className={ICON} aria-hidden /> },
  failed: { tone: 'deny', icon: <ShieldAlert className={ICON} aria-hidden /> },
  decommissioned: { tone: 'neutral', icon: <Ban className={ICON} aria-hidden /> },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted">—</span>;
  const meta = STATUSES[status] ?? { tone: 'neutral' as Tone, icon: <CircleDot className={ICON} aria-hidden /> };
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {humanize(status)}
    </Badge>
  );
}

const RISK: Record<string, Tone> = { low: 'allow', medium: 'restrict', high: 'approval', critical: 'deny' };

export function riskTone(level: string | null | undefined): Tone {
  return (level && RISK[level]) || 'neutral';
}

export function RiskBadge({ score, level }: { score: number | null | undefined; level: string | null | undefined }) {
  if (score === null || score === undefined) return <span className="text-muted">—</span>;
  return (
    <Badge tone={riskTone(level)} title={`Risk ${score.toFixed(1)} (${level ?? 'unknown'})`}>
      <span className="tabular-nums">{score.toFixed(1)}</span>
      {level ? <span className="ml-1 opacity-80">{level}</span> : null}
    </Badge>
  );
}

export function DirectBadge({ direct, hops }: { direct: boolean; hops?: number }) {
  return direct ? (
    <Badge tone="info">Direct</Badge>
  ) : (
    <Badge tone="approval">Delegated{hops !== undefined ? ` · ${hops} hop${hops === 1 ? '' : 's'}` : ''}</Badge>
  );
}
