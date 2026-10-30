import type { ReactNode } from 'react';
import { cx } from './cx';

export function PageHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {icon ? <span className="text-accent">{icon}</span> : null}
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-3xl text-[13px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'warn' | 'bad' | 'good';
  className?: string;
}) {
  return (
    <div className={cx('rounded-lg border border-line bg-surface p-4 shadow-[var(--shadow)]', className)}>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted">
        <span>{label}</span>
        {icon ? <span aria-hidden>{icon}</span> : null}
      </div>
      <div
        className={cx(
          'mt-1.5 text-2xl font-semibold tabular-nums',
          tone === 'warn' && 'text-restrict',
          tone === 'bad' && 'text-deny',
          tone === 'good' && 'text-allow',
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-muted">{hint}</div> : null}
    </div>
  );
}

/** Definition list for detail panels. */
export function DescList({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cx('grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-[13px]', className)}>
      {items.map(([term, value], index) => (
        <div key={index} className="contents">
          <dt className="text-muted">{term}</dt>
          <dd className="min-w-0 break-words">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function JsonView({ value, className, maxHeight = 320 }: { value: unknown; className?: string; maxHeight?: number }) {
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    text = String(value);
  }
  return (
    <pre
      className={cx(
        'overflow-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-words text-fg-2',
        className,
      )}
      style={{ maxHeight }}
    >
      {text}
    </pre>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-md border border-line-strong bg-surface p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            'rounded px-2.5 py-1 text-xs font-medium',
            value === option.value ? 'bg-accent text-accent-fg' : 'text-fg-2 hover:bg-surface-2',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Wrapper for UI the current role cannot use: shows a disabled hint. */
export function RoleNote({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-muted italic">{children}</p>;
}
