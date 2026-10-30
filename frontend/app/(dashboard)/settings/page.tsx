'use client';

import { Settings } from 'lucide-react';
import { ResetPanel } from '@/components/settings/ResetPanel';
import { RiskConfigPanel } from '@/components/settings/RiskConfigPanel';
import { UsersPanel } from '@/components/settings/UsersPanel';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DescList, PageHeader } from '@/components/ui/Page';
import { API_BASE } from '@/lib/api';
import { ROLE_DESCRIPTIONS, ROLES } from '@/lib/permissions';
import { useSession } from '@/lib/session';

export default function SettingsPage() {
  const { user, can } = useSession();
  return (
    <>
      <PageHeader title="Settings" icon={<Settings className="size-5" />} description="Risk model parameters, console users and the demonstration environment." />
      <div className="flex flex-col gap-5">
        <RiskConfigPanel />
        {can('users.manage') ? <UsersPanel /> : null}
        {can('environment.reset') ? <ResetPanel /> : null}
        <Card>
          <CardHeader title="Your access" />
          <CardBody className="flex flex-col gap-4">
            <DescList
              items={[
                ['Signed in as', user ? `${user.name} <${user.email}>` : '—'],
                ['Role', user ? <Badge key="r">{user.role}</Badge> : '—'],
                ['Gateway', <code key="g" className="font-mono text-xs">{API_BASE}</code>],
              ]}
            />
            <ul className="flex flex-col gap-1 text-xs">
              {ROLES.map((role) => (
                <li key={role} className={role === user?.role ? 'font-semibold' : 'text-muted'}>
                  <span className="inline-block w-20">{role}</span> {ROLE_DESCRIPTIONS[role]}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
