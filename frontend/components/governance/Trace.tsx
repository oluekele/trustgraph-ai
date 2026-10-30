import { CheckCircle2, Info, TriangleAlert, XCircle } from 'lucide-react';
import type { TraceStep } from '@/lib/types';
import { cx } from '@/components/ui/cx';
import { humanize } from '@/lib/format';

const OUTCOME = {
  pass: { icon: CheckCircle2, cls: 'text-allow', label: 'Pass' },
  fail: { icon: XCircle, cls: 'text-deny', label: 'Fail' },
  warn: { icon: TriangleAlert, cls: 'text-restrict', label: 'Warning' },
  info: { icon: Info, cls: 'text-info', label: 'Info' },
} as const;

/** Step-by-step decision trace (identity → capability → … → approval). */
export function TraceView({ trace }: { trace: TraceStep[] }) {
  if (!trace.length) return <p className="text-xs text-muted">No trace recorded.</p>;
  return (
    <ol className="relative flex flex-col">
      {trace.map((step, index) => {
        const meta = OUTCOME[step.outcome] ?? OUTCOME.info;
        const Icon = meta.icon;
        return (
          <li key={index} className="relative flex gap-3 pb-3 last:pb-0">
            {index < trace.length - 1 ? (
              <span className="absolute top-5 left-[9px] h-[calc(100%-14px)] w-px bg-line" aria-hidden />
            ) : null}
            <Icon className={cx('relative z-10 size-[19px] shrink-0 rounded-full bg-surface', meta.cls)} aria-hidden />
            <div className="min-w-0 pt-px">
              <p className="text-[13px] font-medium">
                {humanize(step.step)} <span className={cx('ml-1 text-[11px] font-semibold', meta.cls)}>{meta.label}</span>
              </p>
              <p className="text-[12px] break-words text-fg-2">{step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
