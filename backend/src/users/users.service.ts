import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { authConfig, AuthConfig, DEFAULT_PASSWORD } from '../config/configuration';
import { Role } from '../common/roles';
import { CreateUserDto, UpdateUserDto, UserView } from './dto/user.dto';
import { Operator } from './operator.entity';

export const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function toUserView(operator: Operator): UserView {
  return {
    id: operator.id,
    email: operator.email,
    name: operator.name,
    role: operator.role,
    active: operator.active,
    createdAt: operator.createdAt.toISOString(),
    lastLoginAt: operator.lastLoginAt ? operator.lastLoginAt.toISOString() : null,
  };
}

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(Operator) private readonly operators: Repository<Operator>,
    @Inject(authConfig.KEY) private readonly auth: AuthConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedIfEmpty();
  }

  async findAll(): Promise<UserView[]> {
    const operators = await this.operators.find({ order: { createdAt: 'ASC' } });
    return operators.map(toUserView);
  }

  /** Includes the password hash; for credential checks only. */
  findByEmailWithPassword(email: string): Promise<Operator | null> {
    return this.operators
      .createQueryBuilder('operator')
      .addSelect('operator.passwordHash')
      .where('operator.email = :email', { email: email.trim().toLowerCase() })
      .getOne();
  }

  findById(id: string): Promise<Operator | null> {
    return this.operators.findOne({ where: { id } });
  }

  async recordLogin(id: string): Promise<void> {
    await this.operators.update({ id }, { lastLoginAt: new Date() });
  }

  async create(dto: CreateUserDto): Promise<UserView> {
    const email = dto.email.trim().toLowerCase();
    if (await this.operators.exist({ where: { email } })) {
      throw new ConflictException(`An operator with email '${email}' already exists.`);
    }
    const operator = this.operators.create({
      email,
      name: dto.name.trim(),
      role: dto.role,
      passwordHash: await hashPassword(dto.password),
      active: true,
      lastLoginAt: null,
    });
    return toUserView(await this.operators.save(operator));
  }

  async update(id: string, dto: UpdateUserDto, actingUserId: string): Promise<UserView> {
    const operator = await this.findById(id);
    if (!operator) throw new NotFoundException(`Operator '${id}' not found.`);
    if (dto.role === undefined && dto.active === undefined) {
      throw new BadRequestException('Provide at least one of: role, active.');
    }
    const demotesSelf = id === actingUserId && (dto.active === false || (dto.role && dto.role !== Role.Admin));
    if (demotesSelf) {
      throw new BadRequestException('You cannot deactivate or demote your own account.');
    }
    if (dto.role !== undefined) operator.role = dto.role;
    if (dto.active !== undefined) operator.active = dto.active;
    return toUserView(await this.operators.save(operator));
  }

  private async seedIfEmpty(): Promise<void> {
    if ((await this.operators.count()) > 0) return;

    const seeds: Array<{ email: string; name: string; role: Role; password: string }> = [
      { email: this.auth.adminEmail, name: 'TrustGraph Administrator', role: Role.Admin, password: this.auth.adminPassword },
    ];
    if (this.auth.seedDemoUsers) {
      seeds.push(
        { email: 'operator@trustgraph.local', name: 'Demo Operator', role: Role.Operator, password: DEFAULT_PASSWORD },
        { email: 'approver@trustgraph.local', name: 'Demo Approver', role: Role.Approver, password: DEFAULT_PASSWORD },
        { email: 'auditor@trustgraph.local', name: 'Demo Auditor', role: Role.Auditor, password: DEFAULT_PASSWORD },
      );
    }
    for (const seed of seeds) {
      await this.operators.save(
        this.operators.create({
          email: seed.email,
          name: seed.name,
          role: seed.role,
          passwordHash: await hashPassword(seed.password),
          active: true,
          lastLoginAt: null,
        }),
      );
    }
    this.logger.log(`Seeded ${seeds.length} operator account(s): ${seeds.map((s) => `${s.email} (${s.role})`).join(', ')}`);
    if (this.auth.usingDefaultAdminCredentials) {
      this.logger.warn(
        'Default admin credentials are in use (ADMIN_EMAIL/ADMIN_PASSWORD not set). Change them before any shared deployment.',
      );
    }
    if (this.auth.seedDemoUsers) {
      this.logger.warn(`Demo operator accounts were created with the default password '${DEFAULT_PASSWORD}'.`);
    }
  }
}
