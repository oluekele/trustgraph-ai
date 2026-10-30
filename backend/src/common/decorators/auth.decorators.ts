import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser, Role } from '../roles';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'minimumRole';

/** Opt a route out of the global JWT guard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Minimum role required for a route (roles are hierarchical). Routes without
 * this decorator are available to any authenticated operator (auditor and up).
 */
export const Roles = (role: Role) => SetMetadata(ROLES_KEY, role);

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.user) {
    throw new Error('CurrentUser used on a route without an authenticated user.');
  }
  return request.user;
});
