import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { authConfig, AuthConfig } from '../config/configuration';
import { AuthenticatedRequest, IS_PUBLIC_KEY } from '../common/decorators/auth.decorators';
import { AuthService } from './auth.service';

/** Global guard: accepts the `tg_session` httpOnly cookie or an `Authorization: Bearer` token. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Authentication required.');
    request.user = await this.auth.verify(token);
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const header = request.headers.authorization;
    if (header) {
      const [scheme, value] = header.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && value) return value.trim();
    }
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[this.config.cookieName] || null;
  }
}
