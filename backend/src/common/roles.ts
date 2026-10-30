/**
 * Human operator roles. They are hierarchical: each role includes every
 * permission of the roles listed before it.
 */
export enum Role {
  Auditor = 'auditor',
  Approver = 'approver',
  Operator = 'operator',
  Admin = 'admin',
}

export const ROLE_HIERARCHY: readonly Role[] = [Role.Auditor, Role.Approver, Role.Operator, Role.Admin];

export function roleRank(role: Role | string): number {
  return ROLE_HIERARCHY.indexOf(role as Role);
}

/** True when `role` is at least as privileged as `required`. */
export function hasRole(role: Role | string, required: Role): boolean {
  const rank = roleRank(role);
  return rank >= 0 && rank >= roleRank(required);
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}
