import { DataSourceOptions } from 'typeorm';
import { LoginEvent } from '../auth/login-event.entity';
import { DatabaseConfig } from '../config/configuration';
import { Operator } from '../users/operator.entity';
import { CreateOperatorTables1760342400000 } from './migrations/1760342400000-CreateOperatorTables';

/**
 * Gateway-owned schema only. The Python governance engine shares the database
 * but uses its own tables, so a separate migrations table is used as well.
 */
export function buildDataSourceOptions(db: DatabaseConfig): DataSourceOptions {
  return {
    type: 'postgres',
    url: db.url,
    entities: [Operator, LoginEvent],
    migrations: [CreateOperatorTables1760342400000],
    migrationsTableName: 'gateway_migrations',
    migrationsRun: db.migrationsRun,
    synchronize: db.synchronize,
  };
}
