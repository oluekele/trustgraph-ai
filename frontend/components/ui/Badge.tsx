import type { ReactNode } from 'react';
import { cx } from './cx';

export type Tone = 'allow' | 'restrict' | 'approval' | 'deny' | 'info' | 'neutral' | 'accent';

const TONES: Record<Tone, string> = {
  allow: 'bg-allow-bg text-allow border-allow-border',
  restrict: 'bg-restrict-bg text-restrict border-restrict-border',
  approval: 'bg-approval-bg text-approval border-approval-border',
  deny: 'bg-deny-bg text-deny border-deny-border',
  info: 'bg-info-bg text-info border-info-border',
  neutral: 'bg-neutral-bg text-neutral border-neutral-border',
  accent: 'bg-accent-soft text-accent border-transparent',
};

interface BadgeProps {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
  mono?: boolean;
}

export function Badge({ tone = 'neutral', icon, children, className, title, mono }: BadgeProps) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap',
        mono && 'font-mono',
        TONES[tone],
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Small monospace chip for identifiers. */
export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code
      className={cx(
        'rounded border border-line bg-surface-2 px-1.5 py-px font-mono text-[11.5px] break-all text-fg-2',
        className,
      )}
    >
      {children}
    </code>
  );
}
