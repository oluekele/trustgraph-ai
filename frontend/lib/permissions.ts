import type { Role } from './types';

const RANK: Record<Role, number> = { auditor: 0, approver: 1, operator: 2, admin: 3 };

export const ROLES: Role[] = ['auditor', 'approver', 'operator', 'admin'];

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  auditor: 'Read-only access to governance state and audit trail.',
  approver: 'Auditor + approve, reject and execute human-approval requests.',
  operator: 'Approver + simulations, agent runs, delegations, evaluation, graph sync.',
  admin: 'Operator + principals, grants, policies, catalogue, users and environment reset.',
};

/** Actions gated in the UI. The gateway enforces the same matrix server-side. */
export type Action =
  | 'approvals.decide'
  | 'runtime.simulate'
  | 'agents.run'
  | 'delegations.manage'
  | 'evaluation.run'
  | 'graph.sync'
  | 'principals.manage'
  | 'grants.manage'
  | 'policies.manage'
  | 'catalogue.manage'
  | 'users.manage'
  | 'environment.reset';

const MINIMUM: Record<Action, Role> = {
  'approvals.decide': 'approver',
  'runtime.simulate': 'operator',
  'agents.run': 'operator',
  'delegations.manage': 'operator',
  'evaluation.run': 'operator',
  'graph.sync': 'operator',
  'principals.manage': 'admin',
  'grants.manage': 'admin',
  'policies.manage': 'admin',
  'catalogue.manage': 'admin',
  'users.manage': 'admin',
  'environment.reset': 'admin',
};

export function hasRole(role: Role | undefined, minimum: Role): boolean {
  if (!role) return false;
  return (RANK[role] ?? -1) >= RANK[minimum];
}

export function can(role: Role | undefined, action: Action): boolean {
  return hasRole(role, MINIMUM[action]);
}

export function minimumRole(action: Action): Role {
  return MINIMUM[action];
}
