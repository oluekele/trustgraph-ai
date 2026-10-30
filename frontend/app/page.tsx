import { DashboardShell } from '@/components/layout/DashboardShell';
import { OverviewPage } from '@/components/overview/OverviewPage';

/*
 * The overview lives at the root route. It shares the dashboard shell with the
 * pages under app/(dashboard) (a route group cannot also own "/" while this
 * file exists).
 */
export default function Home() {
  return (
    <DashboardShell>
      <OverviewPage />
    </DashboardShell>
  );
}
