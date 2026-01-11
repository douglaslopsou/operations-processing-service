import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  TypeOrmModule,
  getRepositoryToken,
  getDataSourceToken,
} from '@nestjs/typeorm';
import { getQueueToken, BullModule } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import request from 'supertest';
import { OperationsController } from '../src/operations/operations.controller';
import { OperationsService } from '../src/operations/operations.service';
import { ValidationService } from '../src/operations/services/validation.service';
import { OperationStateMachine } from '../src/operations/state-machine/operation-state-machine';
import { StateTransitionValidator } from '../src/operations/state-machine/state-transition.validator';
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
import { createMockQueue } from './mocks/bullmq.mock';

describe('Operations Integration Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accountRepository: Repository<Account>;
  let operationRepository: Repository<Operation>;
  let eventRepository: Repository<OperationEvent>;
  let queue: Queue;
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
    if (dataSource && dataSource.isInitialized) {
      await cleanDatabase(dataSource);
    }

    process.env.REDIS_HOST = containerConfig.redisHost;
    process.env.REDIS_PORT = containerConfig.redisPort.toString();
    process.env.REDIS_PASSWORD = '';

    const mockQueue = createMockQueue();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: containerConfig.postgresHost,
          port: containerConfig.postgresPort,
          username: containerConfig.postgresUser,
          password: containerConfig.postgresPassword,
          database: containerConfig.postgresDatabase,
          entities: [Account, Operation, OperationEvent],
          synchronize: false,
          logging: false,
        }),
        TypeOrmModule.forFeature([Account, Operation, OperationEvent]),
        BullModule.forRoot({
          connection: {
            host: containerConfig.redisHost,
            port: containerConfig.redisPort,
            password: '',
          },
        }),
        BullModule.registerQueue({
          name: 'operation-state-transitions',
        }),
      ],
      controllers: [OperationsController],
      providers: [
        OperationsService,
        ValidationService,
        OperationStateMachine,
        StateTransitionValidator,
        {
          provide: getQueueToken('operation-state-transitions'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    dataSource = moduleFixture.get<DataSource>(getDataSourceToken());
    accountRepository = moduleFixture.get<Repository<Account>>(
      getRepositoryToken(Account),
    );
    operationRepository = moduleFixture.get<Repository<Operation>>(
      getRepositoryToken(Operation),
    );
    eventRepository = moduleFixture.get<Repository<OperationEvent>>(
      getRepositoryToken(OperationEvent),
    );
    queue = mockQueue as Queue;

    await app.init();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  describe('POST /operations', () => {
    it('should create operation with success', async () => {
      const account = accountRepository.create({
        externalId: 'acc-integration-1',
        accountNumber: '0000001000',
        holderName: 'Integration Test Account',
        balance: 1000.0,
        currency: 'USD',
      });
      const savedAccount = await accountRepository.save(account);

      const createDto = {
        externalId: 'op-integration-1',
        accountId: savedAccount.accountId,
        operationType: OperationType.CREDIT,
        amount: 100.5,
        currency: 'USD',
      };

      const response = await request(app.getHttpServer())
        .post('/operations')
        .send(createDto)
        .expect(202);

      expect(response.body).toMatchObject({
        externalId: 'op-integration-1',
        accountId: savedAccount.accountId,
        operationType: OperationType.CREDIT,
        amount: 100.5,
        currency: 'USD',
        currentState: OperationState.CREATED,
      });

      const operation = await operationRepository.findOne({
        where: { externalId: 'op-integration-1' },
      });
      expect(operation).toBeDefined();
      expect(operation?.currentState).toBe(OperationState.CREATED);

      const event = await eventRepository.findOne({
        where: { externalId: 'op-integration-1' },
      });
      expect(event).toBeDefined();
      expect(event?.eventType).toBe('operation_created');
      expect(event?.isProcessed).toBe(false);

      expect(queue.add).toHaveBeenCalledWith('process-transition', {
        external_id: 'op-integration-1',
      });
    });

    it('should reject when account does not exist', async () => {
      const createDto = {
        externalId: 'op-integration-2',
        accountId: '123e4567-e89b-12d3-a456-426614174000',
        operationType: OperationType.CREDIT,
        amount: 100.5,
        currency: 'USD',
      };

      const response = await request(app.getHttpServer())
        .post('/operations')
        .send(createDto)
        .expect(404);

      expect(response.body.message).toBe('Account not found');

      const operation = await operationRepository.findOne({
        where: { externalId: 'op-integration-2' },
      });
      expect(operation).toBeNull();

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should reject when externalId is duplicated', async () => {
      const account = accountRepository.create({
        externalId: 'acc-integration-2',
        accountNumber: '0000001001',
        holderName: 'Integration Test Account 2',
        balance: 2000.0,
        currency: 'USD',
      });
      const savedAccount = await accountRepository.save(account);

      const existingOperation = operationRepository.create({
        externalId: 'op-integration-3',
        accountId: savedAccount.accountId,
        operationType: OperationType.CREDIT,
        currentState: OperationState.PROCESSING,
        amount: 50.0,
        currency: 'USD',
      });
      await operationRepository.save(existingOperation);

      const createDto = {
        externalId: 'op-integration-3',
        accountId: savedAccount.accountId,
        operationType: OperationType.CREDIT,
        amount: 100.5,
        currency: 'USD',
      };

      const response = await request(app.getHttpServer())
        .post('/operations')
        .send(createDto)
        .expect(422);

      expect(response.body.message).toContain(
        "Operation with external_id 'op-integration-3' already exists",
      );

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const invalidDto = {
        externalId: '',
        accountId: 'invalid-uuid',
        operationType: 'INVALID',
        amount: -100,
      };

      const response = await request(app.getHttpServer())
        .post('/operations')
        .send(invalidDto)
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('GET /operations/:id', () => {
    it('should return operation by ID', async () => {
      const account = accountRepository.create({
        externalId: 'acc-integration-3',
        accountNumber: '0000001002',
        holderName: 'Integration Test Account 3',
        balance: 3000.0,
        currency: 'USD',
      });
      const savedAccount = await accountRepository.save(account);

      const operation = operationRepository.create({
        externalId: 'op-integration-4',
        accountId: savedAccount.accountId,
        operationType: OperationType.CREDIT,
        currentState: OperationState.PROCESSING,
        amount: 150.0,
        currency: 'USD',
      });
      const savedOperation = await operationRepository.save(operation);

      const response = await request(app.getHttpServer())
        .get(`/operations/${savedOperation.operationId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        operationId: savedOperation.operationId,
        externalId: 'op-integration-4',
        accountId: savedAccount.accountId,
        currentState: OperationState.PROCESSING,
      });
    });

    it('should return 404 when operation not found', async () => {
      const nonExistentId = '123e4567-e89b-12d3-a456-426614174000';

      const response = await request(app.getHttpServer())
        .get(`/operations/${nonExistentId}`)
        .expect(404);

      expect(response.body.message).toBe(
        `Operation with ID ${nonExistentId} not found`,
      );
    });
  });
});
