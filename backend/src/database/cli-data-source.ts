import { DataSource } from 'typeorm';
import { databaseConfig } from '../config/configuration';
import { buildDataSourceOptions } from './data-source';

/** Used by the TypeORM CLI (`npm run migration:run`); the app itself runs migrations on start. */
export default new DataSource({ ...buildDataSourceOptions(databaseConfig()), migrationsRun: false });
