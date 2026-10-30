import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../src/common/decorators/auth.decorators';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { AuthenticatedUser, hasRole, Role } from '../src/common/roles';

function contextFor(user: AuthenticatedUser | undefined, metadata: Record<string, unknown>): {
  context: ExecutionContext;
  reflector: Reflector;
} {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => metadata[key as string]);
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { context, reflector };
}

const user = (role: Role): AuthenticatedUser => ({ id: 'u1', email: `${role}@x.test`, name: role, role });

describe('role hierarchy', () => {
  it('orders auditor < approver < operator < admin', () => {
    expect(hasRole(Role.Admin, Role.Operator)).toBe(true);
    expect(hasRole(Role.Operator, Role.Approver)).toBe(true);
    expect(hasRole(Role.Approver, Role.Auditor)).toBe(true);
    expect(hasRole(Role.Approver, Role.Operator)).toBe(false);
    expect(hasRole(Role.Auditor, Role.Approver)).toBe(false);
    expect(hasRole('superuser', Role.Auditor)).toBe(false);
  });
});

describe('RolesGuard', () => {
  it('allows public routes without a user', () => {
    const { context, reflector } = contextFor(undefined, { [IS_PUBLIC_KEY]: true });
    expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
  });

  it('rejects unauthenticated access to protected routes', () => {
    const { context, reflector } = contextFor(undefined, {});
    expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(UnauthorizedException);
  });

  it('lets any authenticated role read routes without @Roles', () => {
    const { context, reflector } = contextFor(user(Role.Auditor), {});
    expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
  });

  it.each([
    [Role.Auditor, Role.Approver, false],
    [Role.Approver, Role.Approver, true],
    [Role.Operator, Role.Approver, true],
    [Role.Approver, Role.Operator, false],
    [Role.Operator, Role.Admin, false],
    [Role.Admin, Role.Admin, true],
  ])('%s accessing a %s route -> allowed=%s', (actual, required, allowed) => {
    const { context, reflector } = contextFor(user(actual), { [ROLES_KEY]: required });
    const guard = new RolesGuard(reflector);
    if (allowed) {
      expect(guard.canActivate(context)).toBe(true);
    } else {
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    }
  });
});
