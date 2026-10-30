import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AuthenticatedUser, JwtPayload } from '../common/roles';
import { UsersService } from '../users/users.service';
import { LoginEvent } from './login-event.entity';

export interface LoginMetadata {
  ip?: string | null;
  userAgent?: string | null;
}

export interface LoginResult {
  user: AuthenticatedUser;
  token: string;
}

// Compared against when the email is unknown so response time does not reveal which accounts exist.
let dummyHash: Promise<string> | undefined;
const getDummyHash = (): Promise<string> => (dummyHash ??= bcrypt.hash('timing-equaliser', 12));
const INVALID_CREDENTIALS = 'Invalid email or password.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @InjectRepository(LoginEvent) private readonly loginEvents: Repository<LoginEvent>,
  ) {}

  async login(email: string, password: string, meta: LoginMetadata = {}): Promise<LoginResult> {
    const normalized = email.trim().toLowerCase();
    const operator = await this.users.findByEmailWithPassword(normalized);
    const passwordMatches = await bcrypt.compare(password, operator?.passwordHash ?? (await getDummyHash()));

    let failure: string | null = null;
    if (!operator) failure = 'unknown_email';
    else if (!passwordMatches) failure = 'bad_password';
    else if (!operator.active) failure = 'inactive';

    await this.recordEvent(normalized, failure === null, failure, meta);
    if (failure !== null || !operator) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.users.recordLogin(operator.id);
    const user: AuthenticatedUser = { id: operator.id, email: operator.email, name: operator.name, role: operator.role };
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { user, token: await this.jwt.signAsync(payload) };
  }

  /** Verify a session token and re-load the operator so deactivation and role changes apply immediately. */
  async verify(token: string): Promise<AuthenticatedUser> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Session is invalid or has expired.');
    }
    const operator = await this.users.findById(payload.sub);
    if (!operator || !operator.active) {
      throw new UnauthorizedException('Operator account is not active.');
    }
    return { id: operator.id, email: operator.email, name: operator.name, role: operator.role };
  }

  private async recordEvent(email: string, success: boolean, reason: string | null, meta: LoginMetadata): Promise<void> {
    try {
      await this.loginEvents.insert({
        email: email.slice(0, 254),
        success,
        reason,
        ip: meta.ip?.slice(0, 64) ?? null,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
      });
    } catch (error) {
      this.logger.error(`Failed to record login event: ${(error as Error).message}`);
    }
  }
}
