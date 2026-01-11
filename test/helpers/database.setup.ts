import { DataSource } from 'typeorm';
import { TestContainerConfig } from './testcontainers.setup';
import { Account } from '../../src/core/entities/account.entity';
import { Operation } from '../../src/core/entities/operation.entity';
import { OperationEvent } from '../../src/core/entities/operation-event.entity';

let testDataSource: DataSource | null = null;

/**
 * Creates and configures a DataSource for tests using Testcontainers configurations
 */
export async function createTestDataSource(
  config: TestContainerConfig,
): Promise<DataSource> {
  if (testDataSource && testDataSource.isInitialized) {
    return testDataSource;
  }

  testDataSource = new DataSource({
    type: 'postgres',
    host: config.postgresHost,
    port: config.postgresPort,
    username: config.postgresUser,
    password: config.postgresPassword,
    database: config.postgresDatabase,
    entities: [Account, Operation, OperationEvent],
    synchronize: false,
    logging: false,
    migrations: ['src/core/migrations/*.ts'],
    migrationsTableName: 'migrations',
  });

  await testDataSource.initialize();
  return testDataSource;
}

/**
 * Runs all migrations on the test database
 */
export async function runMigrations(dataSource: DataSource): Promise<void> {
  await dataSource.runMigrations();
}

/**
 * Reverts all migrations (cleans the database)
 * Note: This function is not currently used but kept for future reference
 */
export async function revertMigrations(dataSource: DataSource): Promise<void> {
  const hasMigrations = await dataSource.showMigrations();
  if (hasMigrations) {
    const queryRunner = dataSource.createQueryRunner();
    try {
      await queryRunner.dropDatabase(dataSource.options.database as string);
      await queryRunner.createDatabase(dataSource.options.database as string);
    } finally {
      await queryRunner.release();
    }
  }
}

/**
 * Cleans all tables in the test database (without deleting the structure)
 */
export async function cleanDatabase(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.query('SET session_replication_role = replica;');

    await queryRunner.query('TRUNCATE TABLE operation_events CASCADE;');
    await queryRunner.query('TRUNCATE TABLE operations CASCADE;');
    await queryRunner.query('TRUNCATE TABLE accounts CASCADE;');

    await queryRunner.query(
      'ALTER SEQUENCE IF EXISTS account_number_seq RESTART WITH 1000;',
    );

    await queryRunner.query('SET session_replication_role = DEFAULT;');
  } finally {
    await queryRunner.release();
  }
}

/**
 * Closes the test DataSource connection
 */
export async function closeTestDataSource(): Promise<void> {
  if (testDataSource && testDataSource.isInitialized) {
    await testDataSource.destroy();
    testDataSource = null;
  }
}

/**
 * Gets the current test DataSource
 */
export function getTestDataSource(): DataSource | null {
  return testDataSource;
}
