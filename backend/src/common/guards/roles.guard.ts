import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest, IS_PUBLIC_KEY, ROLES_KEY } from '../decorators/auth.decorators';
import { hasRole, Role } from '../roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new UnauthorizedException('Authentication required.');

    const required = this.reflector.getAllAndOverride<Role | undefined>(ROLES_KEY, targets) ?? Role.Auditor;
    if (!hasRole(user.role, required)) {
      throw new ForbiddenException(`This action requires the '${required}' role or higher.`);
    }
    return true;
  }
}
