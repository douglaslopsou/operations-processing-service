import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { Account } from '../src/core/entities/account.entity';
import { Operation } from '../src/core/entities/operation.entity';
import { OperationEvent } from '../src/core/entities/operation-event.entity';
import { OperationType } from '../src/core/enums/operation-type.enum';
import { OperationState } from '../src/core/enums/operation-state.enum';
import {
  startTestContainers,
  stopTestContainers,
  TestContainerConfig,
} from './helpers/testcontainers.setup';
import {
  createTestDataSource,
  runMigrations,
  cleanDatabase,
  closeTestDataSource,
} from './helpers/database.setup';

describe('Operations E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accountRepository: Repository<Account>;
  let operationRepository: Repository<Operation>;
  let eventRepository: Repository<OperationEvent>;
  let containerConfig: TestContainerConfig;

  beforeAll(async () => {
    const { config } = await startTestContainers();
    containerConfig = config;

    dataSource = await createTestDataSource(config);
    await runMigrations(dataSource);
  }, 60000);

  afterAll(async () => {
    await closeTestDataSource();
    await stopTestContainers();
  }, 30000);

  beforeEach(async () => {
    process.env.DATABASE_HOST = containerConfig.postgresHost;
    process.env.DATABASE_PORT = containerConfig.postgresPort.toString();
    process.env.DATABASE_USER = containerConfig.postgresUser;
    process.env.DATABASE_PASSWORD = containerConfig.postgresPassword;
    process.env.DATABASE_NAME = containerConfig.postgresDatabase;
    process.env.REDIS_HOST = containerConfig.redisHost;
    process.env.REDIS_PORT = containerConfig.redisPort.toString();
    process.env.REDIS_PASSWORD = '';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const appDataSource = moduleFixture.get<DataSource>(getDataSourceToken());
    if (appDataSource && appDataSource.isInitialized) {
      await cleanDatabase(appDataSource);
    }

    accountRepository = moduleFixture.get<Repository<Account>>(
      getRepositoryToken(Account),
    );
    operationRepository = moduleFixture.get<Repository<Operation>>(
      getRepositoryToken(Operation),
    );
    eventRepository = moduleFixture.get<Repository<OperationEvent>>(
      getRepositoryToken(OperationEvent),
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Complete Operation Flow', () => {
    it('should create operation and process through state machine', async () => {
      const accountExternalId = `acc-e2e-${randomUUID()}`;
      const operationExternalId = `op-e2e-${randomUUID()}`;

      const queryRunner = dataSource.createQueryRunner();
      const accountNumberResult = await queryRunner.query(
        "SELECT LPAD(nextval('account_number_seq')::text, 10, '0') as account_number",
      );
      const accountNumber = accountNumberResult[0].account_number;
      await queryRunner.release();

      const account = accountRepository.create({
        externalId: accountExternalId,
        accountNumber: accountNumber,
        holderName: 'E2E Test Account',
        balance: 1000.0,
        currency: 'USD',
      });
      const savedAccount = await accountRepository.save(account);

      const createDto = {
        externalId: operationExternalId,
        accountId: savedAccount.accountId,
        operationType: OperationType.CREDIT,
        amount: 100.0,
        currency: 'USD',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/operations')
        .send(createDto)
        .expect(202);

      expect(createResponse.body.currentState).toBe(OperationState.CREATED);
      expect(createResponse.body.externalId).toBe(operationExternalId);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const operation = await operationRepository.findOne({
        where: { externalId: operationExternalId },
      });

      expect(operation).toBeDefined();
      expect([
        OperationState.PENDING,
        OperationState.PROCESSING,
        OperationState.COMPLETED,
      ]).toContain(operation?.currentState);

      const events = await eventRepository.find({
        where: { externalId: operationExternalId },
        order: { createdAt: 'ASC' },
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].eventType).toBe('operation_created');
    });

    it('should reject operation when account does not exist', async () => {
      const operationExternalId = `op-e2e-${randomUUID()}`;
      const createDto = {
        externalId: operationExternalId,
        accountId: '123e4567-e89b-12d3-a456-426614174000',
        operationType: OperationType.CREDIT,
        amount: 100.0,
        currency: 'USD',
      };

      const response = await request(app.getHttpServer())
        .post('/operations')
        .send(createDto)
        .expect(404);

      expect(response.body.message).toBe('Account not found');
    });

    it('should get operation by ID with account details', async () => {
      const accountExternalId = `acc-e2e-${randomUUID()}`;
      const operationExternalId = `op-e2e-${randomUUID()}`;

      const queryRunner = dataSource.createQueryRunner();
      const accountNumberResult = await queryRunner.query(
        "SELECT LPAD(nextval('account_number_seq')::text, 10, '0') as account_number",
      );
      const accountNumber = accountNumberResult[0].account_number;
      await queryRunner.release();

      const account = accountRepository.create({
        externalId: accountExternalId,
        accountNumber: accountNumber,
        holderName: 'E2E Test Account 2',
        balance: 2000.0,
        currency: 'USD',
      });
      const savedAccount = await accountRepository.save(account);

      const operation = operationRepository.create({
        externalId: operationExternalId,
        accountId: savedAccount.accountId,
        operationType: OperationType.DEBIT,
        currentState: OperationState.COMPLETED,
        amount: 50.0,
        currency: 'USD',
      });
      const savedOperation = await operationRepository.save(operation);

      const response = await request(app.getHttpServer())
        .get(`/operations/${savedOperation.operationId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        operationId: savedOperation.operationId,
        externalId: operationExternalId,
        accountId: savedAccount.accountId,
        currentState: OperationState.COMPLETED,
      });

      expect(response.body.account).toBeDefined();
      expect(response.body.account.accountId).toBe(savedAccount.accountId);
    });
  });
});
