import { DataSource } from 'typeorm';
import { Account } from '../core/entities/account.entity';
import { Operation } from '../core/entities/operation.entity';
import { OperationEvent } from '../core/entities/operation-event.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5433', 10),
  username: process.env.DATABASE_USER || 'operations_user',
  password: process.env.DATABASE_PASSWORD || 'operations_pass',
  database: process.env.DATABASE_NAME || 'operations_db',
  entities: [Account, Operation, OperationEvent],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  migrations: ['src/core/migrations/*.ts'],
  migrationsTableName: 'migrations',
  migrationsRun: false,
});
