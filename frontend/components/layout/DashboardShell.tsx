'use client';

import { LogOut, Menu, ServerCrash, ShieldHalf, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/States';
import { cx } from '@/components/ui/cx';
import { hasRole } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { NAV } from './nav';

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useSession();
  return (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-fg">
          <ShieldHalf className="size-4.5" aria-hidden />
        </span>
        <div className="leading-tight">
          <p className="text-[13px] font-bold tracking-wide">TrustGraph AI</p>
          <p className="text-[10.5px] text-muted">Agent governance console</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV.map((group) => {
          const items = group.items.filter((item) => hasRole(user?.role, item.minRole));
          if (!items.length) return null;
          return (
            <div key={group.section} className="mt-3">
              <p className="px-2.5 pb-1 text-[10.5px] font-semibold tracking-wider text-muted uppercase">{group.section}</p>
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={cx(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium',
                          active ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="border-t border-line px-4 py-3 text-[10.5px] text-muted">
        MSc research prototype · decisions are made by the TrustGraph engine, not this UI.
      </p>
    </nav>
  );
}

const ROLE_TONE = { admin: 'deny', operator: 'approval', approver: 'info', auditor: 'neutral' } as const;

function Header({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useSession();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:px-6">
      <button
        type="button"
        onClick={onMenu}
        className="rounded-md p-1.5 text-fg-2 hover:bg-surface-2 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>
      <div className="flex-1" />
      {user ? (
        <div className="flex items-center gap-3">
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-[13px] font-medium">{user.name}</p>
            <p className="text-[11px] text-muted">{user.email}</p>
          </div>
          <Badge tone={ROLE_TONE[user.role]} title={`Signed in as ${user.role}`}>
            {user.role}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            loading={signingOut}
            icon={<LogOut className="size-3.5" />}
            onClick={async () => {
              setSigningOut(true);
              await logout();
              router.replace('/login');
            }}
          >
            Sign out
          </Button>
        </div>
      ) : null}
    </header>
  );
}

/** Authenticated application frame: sidebar, header and the auth guard. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const { status, error, refresh } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [status, router, pathname]);

  useEffect(() => setMenuOpen(false), [pathname]);

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-[var(--shadow)]">
          <ServerCrash className="mx-auto size-8 text-deny" aria-hidden />
          <h1 className="mt-3 text-base font-semibold">
            {error?.isUnavailable ? 'Governance service unavailable' : 'Unable to verify your session'}
          </h1>
          <p className="mt-1 text-[13px] text-muted">{error?.message}</p>
          <Button className="mt-4" variant="primary" onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-screen" role="status" aria-live="polite">
        <span className="sr-only">Checking session…</span>
        <div className="hidden w-60 border-r border-line bg-surface p-4 lg:block">
          <Skeleton className="h-8 w-40" />
          <div className="mt-6 flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-6" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-7 w-64" />
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-line bg-surface shadow-[var(--shadow-lg)]">
            <button
              type="button"
              className="absolute top-3 right-3 rounded-md p-1 text-muted hover:bg-surface-2"
              onClick={() => setMenuOpen(false)}
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setMenuOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
