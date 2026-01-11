import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { StartedRedisContainer } from '@testcontainers/redis';

export interface TestContainers {
  postgres: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
}

export interface TestContainerConfig {
  postgresHost: string;
  postgresPort: number;
  postgresDatabase: string;
  postgresUser: string;
  postgresPassword: string;
  redisHost: string;
  redisPort: number;
}

let containers: TestContainers | null = null;

/**
 * Starts PostgreSQL and Redis containers using Testcontainers
 * @returns Object with started containers and connection configurations
 */
export async function startTestContainers(): Promise<{
  containers: TestContainers;
  config: TestContainerConfig;
}> {
  if (containers) {
    throw new Error(
      'Containers already started. Call stopTestContainers first.',
    );
  }

  const postgresContainer = new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .withReuse();

  const postgres = await postgresContainer.start();
  const redisContainer = new RedisContainer('redis:7-alpine').withReuse();
  const redis = await redisContainer.start();

  containers = {
    postgres,
    redis,
  };

  const config: TestContainerConfig = {
    postgresHost: postgres.getHost(),
    postgresPort: postgres.getPort(),
    postgresDatabase: postgres.getDatabase(),
    postgresUser: postgres.getUsername(),
    postgresPassword: postgres.getPassword(),
    redisHost: redis.getHost(),
    redisPort: redis.getPort(),
  };

  return { containers, config };
}

/**
 * Stops and removes test containers
 */
export async function stopTestContainers(): Promise<void> {
  if (!containers) {
    return;
  }

  try {
    await containers.redis.stop();
  } catch (error) {
    console.error('Error stopping Redis container:', error);
  }

  try {
    await containers.postgres.stop();
  } catch (error) {
    console.error('Error stopping PostgreSQL container:', error);
  }

  containers = null;
}

/**
 * Gets active containers (if they exist)
 */
export function getTestContainers(): TestContainers | null {
  return containers;
}
