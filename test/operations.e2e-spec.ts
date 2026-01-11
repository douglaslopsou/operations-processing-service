import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import request from 'supertest';
import { OperationsController } from '../src/operations/operations.controller';
import { OperationsService } from '../src/operations/operations.service';
import { Account } from '../src/core/entities/account.entity';
import { Operation } from '../src/core/entities/operation.entity';
import { OperationEvent } from '../src/core/entities/operation-event.entity';
import { OperationType } from '../src/core/enums/operation-type.enum';
import { OperationState } from '../src/core/enums/operation-state.enum';
import { EventType } from '../src/core/enums/event-type.enum';
import {
  createMockAccount,
  createMockOperation,
  createMockOperationEvent,
} from './mocks/entities.mock';
import {
  createMockQueryBuilder,
  createMockEntityManager,
} from './mocks/typeorm.mock';
import { createMockQueue } from './mocks/bullmq.mock';
import * as crypto from 'crypto';

describe('OperationsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accountRepository: Repository<Account>;
  let operationRepository: Repository<Operation>;
  let eventRepository: Repository<OperationEvent>;
  let queue: Queue;
  let mockManager: Partial<EntityManager>;
  let mockQueryBuilder: any;

  beforeEach(async () => {
    mockQueryBuilder = createMockQueryBuilder();
    mockManager = createMockEntityManager();
    mockManager.createQueryBuilder = jest
      .fn()
      .mockReturnValue(mockQueryBuilder);

    const mockDataSource = {
      transaction: jest
        .fn()
        .mockImplementation((fn: (manager: EntityManager) => Promise<any>) =>
          fn(mockManager as EntityManager),
        ),
    };

    const mockAccountRepository = createMockAccountRepository();
    const mockOperationRepository = createMockOperationRepository();
    const mockEventRepository = createMockEventRepository();
    const mockQueue = createMockQueue();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OperationsController],
      providers: [
        OperationsService,
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
        {
          provide: getRepositoryToken(Account),
          useValue: mockAccountRepository,
        },
        {
          provide: getRepositoryToken(Operation),
          useValue: mockOperationRepository,
        },
        {
          provide: getRepositoryToken(OperationEvent),
          useValue: mockEventRepository,
        },
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
    queue = moduleFixture.get<Queue>(
      getQueueToken('operation-state-transitions'),
    );

    await app.init();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  describe('POST /operations', () => {
    it('should create operation with success', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const externalId = 'op-123';
      const account = createMockAccount({ accountId });

      const createDto = {
        externalId,
        accountId,
        operationType: OperationType.CREDIT,
        amount: 100.5,
        currency: 'USD',
      };

      const expectedOperation = createMockOperation({
        externalId,
        accountId,
        operationType: OperationType.CREDIT,
        amount: 100.5,
        currency: 'USD',
        currentState: OperationState.CREATED,
      });

      (mockManager.findOne as jest.Mock)
        .mockResolvedValueOnce(account)
        .mockResolvedValueOnce(null);
      mockQueryBuilder.getOne.mockResolvedValue(null);
      (mockManager.save as jest.Mock)
        .mockResolvedValueOnce(
          createMockOperationEvent({
            externalId,
            eventType: EventType.OPERATION_CREATED,
            payload: { amount: 100.5, currency: 'USD' },
            payloadHash: crypto
              .createHash('sha256')
              .update(JSON.stringify({ amount: 100.5, currency: 'USD' }))
              .digest('hex'),
            accountId,
            operationType: OperationType.CREDIT,
          }),
        )
        .mockResolvedValueOnce(expectedOperation);

      const response = await request(app.getHttpServer())
        .post('/operations')
        .send(createDto)
        .expect(202);

      expect(response.body).toMatchObject({
        externalId,
        accountId,
        operationType: OperationType.CREDIT,
        amount: 100.5,
        currency: 'USD',
        currentState: OperationState.CREATED,
      });

      expect(mockManager.findOne).toHaveBeenCalledWith(Account, {
        where: { accountId },
      });
      expect(mockManager.save).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith('process-transition', {
        external_id: externalId,
      });
    });

    it('should reject when account does not exist', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const externalId = 'op-123';

      const createDto = {
        externalId,
        accountId,
        operationType: OperationType.CREDIT,
        amount: 100.5,
        currency: 'USD',
      };

      (mockManager.findOne as jest.Mock).mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer())
        .post('/operations')
        .send(createDto)
        .expect(404);

      expect(response.body.message).toBe('Account not found');
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should reject when externalId is duplicated', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const externalId = 'op-123';
      const account = createMockAccount({ accountId });

      const existingOperation = createMockOperation({
        externalId,
        accountId,
        currentState: OperationState.PROCESSING,
      });

      const createDto = {
        externalId,
        accountId,
        operationType: OperationType.CREDIT,
        amount: 100.5,
        currency: 'USD',
      };

      (mockManager.findOne as jest.Mock).mockResolvedValueOnce(account);
      mockQueryBuilder.getOne.mockResolvedValue(existingOperation);

      const response = await request(app.getHttpServer())
        .post('/operations')
        .send(createDto)
        .expect(422);

      expect(response.body.message).toContain(
        "Operation with external_id 'op-123' already exists",
      );
      expect(mockManager.save).not.toHaveBeenCalled();
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
      const operationId = '456e7890-e89b-12d3-a456-426614174001';
      const externalId = 'op-123';
      const accountId = '123e4567-e89b-12d3-a456-426614174000';

      const operation = createMockOperation({
        operationId,
        externalId,
        accountId,
        currentState: OperationState.PROCESSING,
      });

      (operationRepository.findOne as jest.Mock).mockResolvedValue(operation);

      const response = await request(app.getHttpServer())
        .get(`/operations/${operationId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        operationId,
        externalId,
        accountId,
        currentState: OperationState.PROCESSING,
      });

      expect(operationRepository.findOne).toHaveBeenCalledWith({
        where: { operationId },
        relations: ['account'],
      });
    });

    it('should return 404 when operation not found', async () => {
      const operationId = '456e7890-e89b-12d3-a456-426614174001';

      (operationRepository.findOne as jest.Mock).mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get(`/operations/${operationId}`)
        .expect(404);

      expect(response.body.message).toBe(
        `Operation with ID ${operationId} not found`,
      );

      expect(operationRepository.findOne).toHaveBeenCalledWith({
        where: { operationId },
        relations: ['account'],
      });
    });
  });
});

// Helper functions for creating mock repositories
function createMockAccountRepository(): Partial<Repository<Account>> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function createMockOperationRepository(): Partial<Repository<Operation>> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function createMockEventRepository(): Partial<Repository<OperationEvent>> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}
