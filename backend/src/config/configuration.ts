import { registerAs } from '@nestjs/config';

export const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
export const DEFAULT_ADMIN_EMAIL = 'admin@trustgraph.local';
export const DEFAULT_PASSWORD = 'TrustGraph!2026';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && value.trim() !== '' && Number.isFinite(parsed) ? parsed : fallback;
}

export interface AppConfig {
  env: string;
  isProduction: boolean;
  port: number;
  frontendOrigins: string[];
  trustProxy: boolean;
  loginRateLimit: number;
}

export interface DatabaseConfig {
  url: string;
  synchronize: boolean;
  migrationsRun: boolean;
}

export interface AuthConfig {
  jwtSecret: string;
  usingDevSecret: boolean;
  jwtExpiresIn: string;
  sessionMaxAgeMs: number;
  cookieName: string;
  cookieSecure: boolean;
  adminEmail: string;
  adminPassword: string;
  usingDefaultAdminCredentials: boolean;
  seedDemoUsers: boolean;
}

export interface TrustGraphConfig {
  baseUrl: string;
  serviceToken: string;
  timeoutMs: number;
  longTimeoutMs: number;
}

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

export const appConfig = registerAs(
  'app',
  (): AppConfig => ({
    env: process.env.NODE_ENV ?? 'development',
    isProduction: isProduction(),
    port: int(process.env.PORT, 3001),
    frontendOrigins: (process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: bool(process.env.TRUST_PROXY, false),
    loginRateLimit: int(process.env.LOGIN_RATE_LIMIT, 10),
  }),
);

export const databaseConfig = registerAs(
  'database',
  (): DatabaseConfig => ({
    url: process.env.DATABASE_URL ?? 'postgres://trustgraph:trustgraph@localhost:5432/trustgraph',
    // Schema is managed by migrations; synchronize is an opt-in convenience for local hacking.
    synchronize: bool(process.env.DB_SYNCHRONIZE, false),
    migrationsRun: bool(process.env.DB_MIGRATIONS_RUN, true),
  }),
);

export const authConfig = registerAs('auth', (): AuthConfig => {
  const adminEmail = process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
  return {
    jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,
    usingDevSecret: !process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
    sessionMaxAgeMs: 8 * 60 * 60 * 1000,
    cookieName: 'tg_session',
    cookieSecure: isProduction(),
    adminEmail: adminEmail.toLowerCase(),
    adminPassword,
    usingDefaultAdminCredentials: !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    seedDemoUsers: bool(process.env.SEED_DEMO_USERS, !isProduction()),
  };
});

export const trustGraphConfig = registerAs(
  'trustgraph',
  (): TrustGraphConfig => ({
    baseUrl: (process.env.TRUSTGRAPH_API_URL ?? 'http://localhost:8000').replace(/\/+$/, ''),
    serviceToken: process.env.TRUSTGRAPH_SERVICE_TOKEN ?? '',
    timeoutMs: int(process.env.TRUSTGRAPH_TIMEOUT_MS, 10_000),
    longTimeoutMs: int(process.env.TRUSTGRAPH_LONG_TIMEOUT_MS, 120_000),
  }),
);
