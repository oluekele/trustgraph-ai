'use client';

import { AlertTriangle, CircleCheck, Info, Inbox, Lock, RefreshCw, ServerCrash, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError, errorMessage } from '@/lib/api';
import { Button } from './Button';
import { cx } from './cx';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('tg-skeleton', className)} aria-hidden />;
}

export function LoadingBlock({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2.5 p-4">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={cx('h-4', index % 3 === 2 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      <span className="text-muted">{icon ?? <Inbox className="size-7" aria-hidden />}</span>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="max-w-md text-xs text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Error state that distinguishes gateway outage, permission and generic errors. */
export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const status = error instanceof ApiError ? error.status : undefined;
  const unavailable = error instanceof ApiError && error.isUnavailable;
  const forbidden = status === 403;
  const Icon = unavailable ? ServerCrash : forbidden ? Lock : AlertTriangle;
  const title = unavailable
    ? 'Governance service unavailable'
    : forbidden
      ? 'Not permitted for your role'
      : status === 404
        ? 'Not found'
        : 'Something went wrong';
  return (
    <div role="alert" className={cx('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      <Icon className={cx('size-7', forbidden ? 'text-restrict' : 'text-deny')} aria-hidden />
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-lg text-xs text-muted">{errorMessage(error)}</p>
      {onRetry && !forbidden ? (
        <Button size="sm" onClick={onRetry} icon={<RefreshCw className="size-3.5" />} className="mt-2">
          Retry
        </Button>
      ) : null}
    </div>
  );
}

type AlertTone = 'info' | 'success' | 'warning' | 'error';

const ALERT: Record<AlertTone, { cls: string; icon: ReactNode }> = {
  info: { cls: 'bg-info-bg border-info-border text-info', icon: <Info className="size-4" aria-hidden /> },
  success: { cls: 'bg-allow-bg border-allow-border text-allow', icon: <CircleCheck className="size-4" aria-hidden /> },
  warning: {
    cls: 'bg-restrict-bg border-restrict-border text-restrict',
    icon: <AlertTriangle className="size-4" aria-hidden />,
  },
  error: { cls: 'bg-deny-bg border-deny-border text-deny', icon: <XCircle className="size-4" aria-hidden /> },
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
  action,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const { cls, icon } = ALERT[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px]', cls, className)}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-fg-2">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

/** Inline error from a mutation, if any. */
export function MutationError({ error }: { error: unknown }) {
  if (!error) return null;
  const forbidden = error instanceof ApiError && error.isForbidden;
  return (
    <Alert tone={forbidden ? 'warning' : 'error'} title={forbidden ? 'Not permitted' : 'Request failed'}>
      {errorMessage(error)}
    </Alert>
  );
}
