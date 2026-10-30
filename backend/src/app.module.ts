import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RolesGuard } from './common/guards/roles.guard';
import { appConfig, authConfig, databaseConfig, trustGraphConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/data-source';
import { GovernanceModule } from './governance/governance.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      load: [appConfig, authConfig, databaseConfig, trustGraphConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (db: ConfigType<typeof databaseConfig>) => buildDataSourceOptions(db),
    }),
    ThrottlerModule.forRootAsync({
      inject: [appConfig.KEY],
      // Only applied where ThrottlerGuard is used (the login route).
      useFactory: (app: ConfigType<typeof appConfig>) => [{ name: 'login', ttl: 60_000, limit: app.loginRateLimit }],
    }),
    UsersModule,
    AuthModule,
    GovernanceModule,
    HealthModule,
  ],
  providers: [
    // Order matters: authenticate first, then authorise by role.
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
