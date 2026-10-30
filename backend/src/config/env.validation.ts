import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  return value;
};

const toInt = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

/** Raw environment variables accepted by the gateway (all optional except JWT_SECRET in production). */
export class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV?: 'development' | 'production' | 'test';

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  DB_SYNCHRONIZE?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  DB_MIGRATIONS_RUN?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(16)
  JWT_SECRET?: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  FRONTEND_ORIGIN?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  TRUST_PROXY?: boolean;

  @IsOptional()
  @IsString()
  TRUSTGRAPH_API_URL?: string;

  @IsOptional()
  @IsString()
  TRUSTGRAPH_SERVICE_TOKEN?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(100)
  TRUSTGRAPH_TIMEOUT_MS?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(100)
  TRUSTGRAPH_LONG_TIMEOUT_MS?: number;

  @IsOptional()
  @IsEmail()
  ADMIN_EMAIL?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  ADMIN_PASSWORD?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  SEED_DEMO_USERS?: boolean;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  LOGIN_RATE_LIMIT?: number;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: false });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
    throw new Error(`Invalid environment configuration:\n - ${messages.join('\n - ')}`);
  }
  if (validated.NODE_ENV === 'production' && !validated.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set (min 16 characters) when NODE_ENV=production.');
  }
  return validated;
}
