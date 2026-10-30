import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AuthService } from '../src/auth/auth.service';
import { LoginEvent } from '../src/auth/login-event.entity';
import { JwtPayload, Role } from '../src/common/roles';
import { Operator } from '../src/users/operator.entity';
import { hashPassword, UsersService } from '../src/users/users.service';

jest.setTimeout(20_000);

describe('password hashing', () => {
  it('produces a salted bcrypt hash that verifies only the right password', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(hash).not.toContain('correct horse battery');
    await expect(bcrypt.compare('correct horse battery', hash)).resolves.toBe(true);
    await expect(bcrypt.compare('wrong password', hash)).resolves.toBe(false);
    expect(await hashPassword('correct horse battery')).not.toEqual(hash);
  });
});

describe('AuthService', () => {
  let operator: Operator;
  let users: jest.Mocked<Pick<UsersService, 'findByEmailWithPassword' | 'findById' | 'recordLogin'>>;
  let insert: jest.Mock;
  let jwt: JwtService;
  let service: AuthService;

  beforeAll(async () => {
    operator = Object.assign(new Operator(), {
      id: '6f1c1f4e-5b0a-4d8e-9a43-1a2b3c4d5e6f',
      email: 'approver@trustgraph.local',
      name: 'Demo Approver',
      role: Role.Approver,
      passwordHash: await bcrypt.hash('TrustGraph!2026', 4),
      active: true,
      createdAt: new Date(),
      lastLoginAt: null,
    });
  });

  beforeEach(() => {
    users = {
      findByEmailWithPassword: jest.fn(async (email: string) => (email === operator.email ? { ...operator } : null)),
      findById: jest.fn(async (id: string) => (id === operator.id ? { ...operator } : null)),
      recordLogin: jest.fn(async () => undefined),
    } as unknown as typeof users;
    insert = jest.fn(async () => ({}));
    jwt = new JwtService({ secret: 'unit-test-secret-0123456789', signOptions: { expiresIn: '1h' } });
    service = new AuthService(
      users as unknown as UsersService,
      jwt,
      { insert } as unknown as Repository<LoginEvent>,
    );
  });

  it('logs in with valid credentials, issues a JWT and records a successful login event', async () => {
    const result = await service.login('  Approver@TrustGraph.local ', 'TrustGraph!2026', { ip: '10.0.0.1', userAgent: 'jest' });

    expect(result.user).toEqual({ id: operator.id, email: operator.email, name: operator.name, role: Role.Approver });
    const payload = await jwt.verifyAsync<JwtPayload>(result.token);
    expect(payload).toMatchObject({ sub: operator.id, email: operator.email, role: Role.Approver });
    expect(users.recordLogin).toHaveBeenCalledWith(operator.id);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ email: operator.email, success: true, reason: null, ip: '10.0.0.1', userAgent: 'jest' }),
    );
  });

  it('rejects a wrong password with a generic error and records the failure', async () => {
    await expect(service.login(operator.email, 'not-the-password')).rejects.toThrow(
      new UnauthorizedException('Invalid email or password.'),
    );
    expect(users.recordLogin).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ success: false, reason: 'bad_password' }));
  });

  it('rejects an unknown email with the same generic error', async () => {
    await expect(service.login('nobody@trustgraph.local', 'whatever-password')).rejects.toThrow('Invalid email or password.');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ success: false, reason: 'unknown_email' }));
  });

  it('rejects inactive operators even with the right password', async () => {
    users.findByEmailWithPassword.mockResolvedValueOnce({ ...operator, active: false } as Operator);
    await expect(service.login(operator.email, 'TrustGraph!2026')).rejects.toThrow(UnauthorizedException);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ success: false, reason: 'inactive' }));
  });

  it('verifies a session token against the current operator record', async () => {
    const { token } = await service.login(operator.email, 'TrustGraph!2026');
    await expect(service.verify(token)).resolves.toMatchObject({ email: operator.email, role: Role.Approver });

    users.findById.mockResolvedValueOnce({ ...operator, active: false } as Operator);
    await expect(service.verify(token)).rejects.toThrow(UnauthorizedException);
    await expect(service.verify('garbage.token.value')).rejects.toThrow(UnauthorizedException);
  });
});
