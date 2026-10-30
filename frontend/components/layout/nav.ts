import {
  Bot,
  FlaskConical,
  GitFork,
  LayoutDashboard,
  type LucideIcon,
  Network,
  ScrollText,
  Settings,
  ShieldCheck,
  SquareTerminal,
  UserCheck,
} from 'lucide-react';
import type { Role } from '@/lib/types';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  minRole: Role;
}

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Monitor',
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard, minRole: 'auditor' },
      { href: '/audit', label: 'Audit trail', icon: ScrollText, minRole: 'auditor' },
      { href: '/graph', label: 'Authority graph', icon: Network, minRole: 'auditor' },
    ],
  },
  {
    section: 'Govern',
    items: [
      { href: '/agents', label: 'Agents', icon: Bot, minRole: 'auditor' },
      { href: '/delegations', label: 'Delegations', icon: GitFork, minRole: 'auditor' },
      { href: '/policies', label: 'Policies', icon: ShieldCheck, minRole: 'auditor' },
      { href: '/approvals', label: 'Approvals', icon: UserCheck, minRole: 'auditor' },
    ],
  },
  {
    section: 'Experiment',
    items: [
      { href: '/playground', label: 'Playground', icon: SquareTerminal, minRole: 'operator' },
      { href: '/evaluation', label: 'Evaluation', icon: FlaskConical, minRole: 'auditor' },
      { href: '/settings', label: 'Settings', icon: Settings, minRole: 'auditor' },
    ],
  },
];
