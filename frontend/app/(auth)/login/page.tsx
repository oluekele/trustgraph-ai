'use client';

import { KeyRound, LogIn, ShieldHalf } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/States';
import { ApiError, errorMessage } from '@/lib/api';
import { ROLE_DESCRIPTIONS } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { Role } from '@/lib/types';

const DEMO_PASSWORD = 'TrustGraph!2026';
const DEMO_ACCOUNTS: { email: string; role: Role }[] = [
  { email: 'admin@trustgraph.local', role: 'admin' },
  { email: 'operator@trustgraph.local', role: 'operator' },
  { email: 'approver@trustgraph.local', role: 'approver' },
  { email: 'auditor@trustgraph.local', role: 'auditor' },
];

function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function LoginForm() {
  const { status, login } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace(next);
  }, [status, router, next]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace(next);
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 401 || err.status === 400)
          ? 'Invalid email or password.'
          : errorMessage(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <ShieldHalf className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold">TrustGraph AI</h1>
          <p className="text-xs text-muted">Identity, delegation &amp; runtime governance for AI agents</p>
        </div>
      </div>
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow)]"
        aria-labelledby="signin-title"
      >
        <h2 id="signin-title" className="text-[15px] font-semibold">
          Operator sign-in
        </h2>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label="Email" required>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        <Field label="Password" required>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={submitting} icon={<LogIn className="size-4" />}>
          Sign in
        </Button>
      </form>
      <section className="mt-5 rounded-lg border border-dashed border-line-strong bg-surface-2 p-4" aria-label="Demo accounts">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-fg-2">
          <KeyRound className="size-3.5" aria-hidden /> Demo accounts (development)
        </p>
        <p className="mt-1 text-[11px] text-muted">
          Password for all: <code className="font-mono">{DEMO_PASSWORD}</code>. Click to fill.
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                }}
                className="w-full rounded-md px-2 py-1 text-left hover:bg-surface-3"
                title={ROLE_DESCRIPTIONS[account.role]}
              >
                <span className="font-mono text-[12px]">{account.email}</span>
                <span className="ml-2 text-[11px] text-muted">{account.role}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
