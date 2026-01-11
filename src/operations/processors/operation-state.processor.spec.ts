import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { OperationStateProcessor } from './operation-state.processor';
import { Operation } from '../../core/entities/operation.entity';
import { OperationEvent } from '../../core/entities/operation-event.entity';
import { Account } from '../../core/entities/account.entity';
import { OperationStateMachine } from '../state-machine/operation-state-machine';
import { ValidationService } from '../services/validation.service';
import {
  OperationState,
  FINAL_STATES,
} from '../../core/enums/operation-state.enum';
import { EventType } from '../../core/enums/event-type.enum';
import { OperationType } from '../../core/enums/operation-type.enum';
import {
  createMockAccount,
  createMockOperation,
  createMockOperationEvent,
} from '../../../test/mocks/entities.mock';
import {
  createMockQueryBuilder,
  createMockEntityManager,
} from '../../../test/mocks/typeorm.mock';
import {
  createMockQueue,
  createMockJob,
} from '../../../test/mocks/bullmq.mock';
import * as crypto from 'crypto';

describe('OperationStateProcessor', () => {
  let processor: OperationStateProcessor;
  let dataSource: DataSource;
  let operationRepository: Repository<Operation>;
  let eventRepository: Repository<OperationEvent>;
  let accountRepository: Repository<Account>;
  let stateMachine: OperationStateMachine;
  let validationService: ValidationService;
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

    const mockOperationRepository = {
      findOne: jest.fn(),
    };

    const mockEventRepository = {
      findOne: jest.fn(),
    };

    const mockAccountRepository = {
      findOne: jest.fn(),
    };

    const mockStateMachine = {
      canTransition: jest.fn().mockReturnValue(true),
      applyTransition: jest.fn(),
    };

    const mockValidationService = {
      validateOperation: jest.fn(),
    };

    const mockQueue = createMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationStateProcessor,
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
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
          provide: getRepositoryToken(Account),
          useValue: mockAccountRepository,
        },
        {
          provide: OperationStateMachine,
          useValue: mockStateMachine,
        },
        {
          provide: ValidationService,
          useValue: mockValidationService,
        },
        {
          provide: getQueueToken('operation-state-transitions'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    processor = module.get<OperationStateProcessor>(OperationStateProcessor);
    dataSource = module.get<DataSource>(getDataSourceToken());
    operationRepository = module.get<Repository<Operation>>(
      getRepositoryToken(Operation),
    );
    eventRepository = module.get<Repository<OperationEvent>>(
      getRepositoryToken(OperationEvent),
    );
    accountRepository = module.get<Repository<Account>>(
      getRepositoryToken(Account),
    );
    stateMachine = module.get<OperationStateMachine>(OperationStateMachine);
    validationService = module.get<ValidationService>(ValidationService);
    queue = module.get<Queue>(getQueueToken('operation-state-transitions'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process - OPERATION_CREATED event', () => {
    it('should create operation in PENDING state when processing OPERATION_CREATED event', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.OPERATION_CREATED,
        isProcessed: false,
        payload: { amount: 100.5, currency: 'USD' },
        payloadHash: crypto
          .createHash('sha256')
          .update(JSON.stringify({ amount: 100.5, currency: 'USD' }))
          .digest('hex'),
      });

      mockQueryBuilder.getOne.mockResolvedValue(null);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);
      (stateMachine.applyTransition as jest.Mock).mockReturnValue(
        OperationState.PENDING,
      );
      (mockManager.findOne as jest.Mock).mockResolvedValue(null);

      await processor.process(job);

      expect(mockManager.createQueryBuilder).toHaveBeenCalled();
      expect(mockManager.find).toHaveBeenCalledWith(OperationEvent, {
        where: { externalId, isProcessed: false },
        order: { createdAt: 'ASC' },
      });
      expect(stateMachine.canTransition).toHaveBeenCalledWith(
        null,
        EventType.OPERATION_CREATED,
      );
      expect(stateMachine.applyTransition).toHaveBeenCalledWith(
        null,
        EventType.OPERATION_CREATED,
      );
      expect(mockManager.save).toHaveBeenCalled();
      expect(mockManager.update).toHaveBeenCalled();
    });

    it('should auto-generate PROCESSING_STARTED event after OPERATION_CREATED', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.OPERATION_CREATED,
        isProcessed: false,
      });

      mockQueryBuilder.getOne.mockResolvedValue(null);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);
      (stateMachine.applyTransition as jest.Mock).mockReturnValue(
        OperationState.PENDING,
      );
      (mockManager.findOne as jest.Mock).mockResolvedValue(null);

      await processor.process(job);

      const saveCalls = (mockManager.save as jest.Mock).mock.calls;
      const processingStartedCall = saveCalls.find(
        (call) =>
          call[0] === OperationEvent &&
          call[1].eventType === EventType.PROCESSING_STARTED,
      );

      expect(processingStartedCall).toBeDefined();
    });
  });

  describe('process - PROCESSING_STARTED event', () => {
    it('should transition to PROCESSING state when processing PROCESSING_STARTED event', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const operation = createMockOperation({
        externalId,
        currentState: OperationState.PENDING,
      });

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.PROCESSING_STARTED,
        isProcessed: false,
      });

      mockQueryBuilder.getOne.mockResolvedValue(operation);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);
      (stateMachine.applyTransition as jest.Mock).mockReturnValue(
        OperationState.PROCESSING,
      );
      (mockManager.findOne as jest.Mock).mockResolvedValue(operation);
      (validationService.validateOperation as jest.Mock).mockResolvedValue(
        EventType.PROCESSING_COMPLETED,
      );

      await processor.process(job);

      expect(stateMachine.applyTransition).toHaveBeenCalledWith(
        OperationState.PENDING,
        EventType.PROCESSING_STARTED,
      );
      expect(validationService.validateOperation).toHaveBeenCalled();
      expect(mockManager.update).toHaveBeenCalled();
    });

    it('should generate PROCESSING_COMPLETED event when validation passes', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const operation = createMockOperation({
        externalId,
        currentState: OperationState.PENDING,
      });

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.PROCESSING_STARTED,
        isProcessed: false,
      });

      mockQueryBuilder.getOne.mockResolvedValue(operation);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);
      (stateMachine.applyTransition as jest.Mock).mockReturnValue(
        OperationState.PROCESSING,
      );
      (mockManager.findOne as jest.Mock).mockResolvedValue(operation);
      (validationService.validateOperation as jest.Mock).mockResolvedValue(
        EventType.PROCESSING_COMPLETED,
      );

      await processor.process(job);

      const saveCalls = (mockManager.save as jest.Mock).mock.calls;
      const completedEventCall = saveCalls.find(
        (call) =>
          call[0] === OperationEvent &&
          call[1].eventType === EventType.PROCESSING_COMPLETED,
      );

      expect(completedEventCall).toBeDefined();
    });

    it('should generate PROCESSING_REJECTED event when validation fails', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const operation = createMockOperation({
        externalId,
        currentState: OperationState.PENDING,
      });

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.PROCESSING_STARTED,
        isProcessed: false,
      });

      mockQueryBuilder.getOne.mockResolvedValue(operation);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);
      (stateMachine.applyTransition as jest.Mock).mockReturnValue(
        OperationState.PROCESSING,
      );
      (mockManager.findOne as jest.Mock).mockResolvedValue(operation);
      (validationService.validateOperation as jest.Mock).mockResolvedValue(
        EventType.PROCESSING_REJECTED,
      );

      await processor.process(job);

      const saveCalls = (mockManager.save as jest.Mock).mock.calls;
      const rejectedEventCall = saveCalls.find(
        (call) =>
          call[0] === OperationEvent &&
          call[1].eventType === EventType.PROCESSING_REJECTED,
      );

      expect(rejectedEventCall).toBeDefined();
    });
  });

  describe('process - PROCESSING_COMPLETED event', () => {
    it('should transition to COMPLETED state and update account balance for CREDIT', async () => {
      const externalId = 'op-123';
      const accountId = 'acc-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const account = createMockAccount({
        accountId,
        balance: 1000,
        currency: 'USD',
      });

      const operation = createMockOperation({
        externalId,
        accountId,
        currentState: OperationState.PROCESSING,
        operationType: OperationType.CREDIT,
        amount: 100.5,
        currency: 'USD',
      });

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.PROCESSING_COMPLETED,
        isProcessed: false,
      });

      mockQueryBuilder.getOne.mockResolvedValue(operation);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);
      (stateMachine.applyTransition as jest.Mock).mockReturnValue(
        OperationState.COMPLETED,
      );
      (mockManager.findOne as jest.Mock)
        .mockResolvedValueOnce(operation)
        .mockResolvedValueOnce(account);

      await processor.process(job);

      expect(stateMachine.applyTransition).toHaveBeenCalledWith(
        OperationState.PROCESSING,
        EventType.PROCESSING_COMPLETED,
      );
      expect(mockManager.increment).toHaveBeenCalledWith(
        Account,
        { accountId },
        'balance',
        100.5,
      );
      expect(mockManager.update).toHaveBeenCalled();
    });

    it('should transition to COMPLETED state and update account balance for DEBIT', async () => {
      const externalId = 'op-123';
      const accountId = 'acc-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const account = createMockAccount({
        accountId,
        balance: 1000,
        currency: 'USD',
      });

      const operation = createMockOperation({
        externalId,
        accountId,
        currentState: OperationState.PROCESSING,
        operationType: OperationType.DEBIT,
        amount: 100.5,
        currency: 'USD',
      });

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.PROCESSING_COMPLETED,
        isProcessed: false,
      });

      mockQueryBuilder.getOne.mockResolvedValue(operation);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);
      (stateMachine.applyTransition as jest.Mock).mockReturnValue(
        OperationState.COMPLETED,
      );
      (mockManager.findOne as jest.Mock)
        .mockResolvedValueOnce(operation)
        .mockResolvedValueOnce(account);

      await processor.process(job);

      expect(mockManager.decrement).toHaveBeenCalledWith(
        Account,
        { accountId },
        'balance',
        100.5,
      );
    });

    it('should not update balance if account not found', async () => {
      const externalId = 'op-123';
      const accountId = 'acc-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const operation = createMockOperation({
        externalId,
        accountId,
        currentState: OperationState.PROCESSING,
        operationType: OperationType.CREDIT,
        amount: 100.5,
      });

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.PROCESSING_COMPLETED,
        isProcessed: false,
      });

      mockQueryBuilder.getOne.mockResolvedValue(operation);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);
      (stateMachine.applyTransition as jest.Mock).mockReturnValue(
        OperationState.COMPLETED,
      );
      (mockManager.findOne as jest.Mock)
        .mockResolvedValueOnce(operation)
        .mockResolvedValueOnce(null);

      await processor.process(job);

      expect(mockManager.increment).not.toHaveBeenCalled();
    });
  });

  describe('process - PROCESSING_REJECTED event', () => {
    it('should transition to REJECTED state when processing PROCESSING_REJECTED event', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const operation = createMockOperation({
        externalId,
        currentState: OperationState.PROCESSING,
      });

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.PROCESSING_REJECTED,
        isProcessed: false,
      });

      mockQueryBuilder.getOne.mockResolvedValue(operation);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);
      (stateMachine.applyTransition as jest.Mock).mockReturnValue(
        OperationState.REJECTED,
      );
      (mockManager.findOne as jest.Mock).mockResolvedValue(operation);

      await processor.process(job);

      expect(stateMachine.applyTransition).toHaveBeenCalledWith(
        OperationState.PROCESSING,
        EventType.PROCESSING_REJECTED,
      );
      expect(mockManager.update).toHaveBeenCalled();
    });
  });

  describe('process - deduplication', () => {
    it('should process only first event from duplicate group', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const payloadHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({ amount: 100.5, currency: 'USD' }))
        .digest('hex');

      const event1 = createMockOperationEvent({
        externalId,
        eventType: EventType.OPERATION_CREATED,
        isProcessed: false,
        payloadHash,
      });

      const event2 = createMockOperationEvent({
        externalId,
        eventType: EventType.OPERATION_CREATED,
        isProcessed: false,
        payloadHash,
      });

      mockQueryBuilder.getOne.mockResolvedValue(null);
      (mockManager.find as jest.Mock).mockResolvedValue([event1, event2]);
      (stateMachine.applyTransition as jest.Mock).mockReturnValue(
        OperationState.PENDING,
      );
      (mockManager.findOne as jest.Mock).mockResolvedValue(null);

      await processor.process(job);

      // Should only call applyTransition once
      expect(stateMachine.applyTransition).toHaveBeenCalledTimes(1);
      // But should mark both events as processed
      expect(mockManager.update).toHaveBeenCalledWith(
        OperationEvent,
        expect.objectContaining({
          operationEventId: expect.anything(),
        }),
        expect.any(Object),
      );
    });
  });

  describe('process - invalid transitions', () => {
    it('should skip invalid state transitions', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const operation = createMockOperation({
        externalId,
        currentState: OperationState.PROCESSING,
      });

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.OPERATION_CREATED, // Invalid transition from PROCESSING
        isProcessed: false,
      });

      mockQueryBuilder.getOne.mockResolvedValue(operation);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);
      (stateMachine.canTransition as jest.Mock).mockReturnValue(false);

      await processor.process(job);

      expect(stateMachine.canTransition).toHaveBeenCalledWith(
        OperationState.PROCESSING,
        EventType.OPERATION_CREATED,
      );
      expect(stateMachine.applyTransition).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalled();
    });
  });

  describe('process - final states', () => {
    it('should mark pending events as processed when operation is in final state', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const operation = createMockOperation({
        externalId,
        currentState: OperationState.COMPLETED, // Final state
      });

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.PROCESSING_COMPLETED,
        isProcessed: false,
      });

      mockQueryBuilder.getOne.mockResolvedValue(operation);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);

      await processor.process(job);

      expect(mockManager.update).toHaveBeenCalledWith(
        OperationEvent,
        { externalId, isProcessed: false },
        { isProcessed: true, processedAt: expect.any(Date) },
      );
      expect(stateMachine.applyTransition).not.toHaveBeenCalled();
    });
  });

  describe('process - idempotency', () => {
    it('should mark events as processed if state is already at target', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const operation = createMockOperation({
        externalId,
        currentState: OperationState.PROCESSING,
      });

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.PROCESSING_STARTED,
        isProcessed: false,
      });

      mockQueryBuilder.getOne.mockResolvedValue(operation);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);
      (stateMachine.applyTransition as jest.Mock).mockReturnValue(
        OperationState.PROCESSING,
      );
      (mockManager.findOne as jest.Mock).mockResolvedValue(operation);

      await processor.process(job);

      // Should mark as processed but not update operation
      expect(mockManager.update).toHaveBeenCalled();
    });
  });

  describe('process - multiple events in sequence', () => {
    it('should process multiple events in correct order', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const event1 = createMockOperationEvent({
        externalId,
        eventType: EventType.OPERATION_CREATED,
        isProcessed: false,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      });

      const event2 = createMockOperationEvent({
        externalId,
        eventType: EventType.PROCESSING_STARTED,
        isProcessed: false,
        createdAt: new Date('2024-01-01T00:00:01.000Z'),
      });

      mockQueryBuilder.getOne.mockResolvedValue(null);
      (mockManager.find as jest.Mock).mockResolvedValue([event1, event2]);
      (stateMachine.applyTransition as jest.Mock)
        .mockReturnValueOnce(OperationState.PENDING)
        .mockReturnValueOnce(OperationState.PROCESSING);
      (mockManager.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          createMockOperation({
            externalId,
            currentState: OperationState.PENDING,
          }),
        )
        .mockResolvedValueOnce(
          createMockOperation({
            externalId,
            currentState: OperationState.PENDING,
          }),
        );
      (validationService.validateOperation as jest.Mock).mockResolvedValue(
        EventType.PROCESSING_COMPLETED,
      );

      await processor.process(job);

      expect(stateMachine.applyTransition).toHaveBeenCalledTimes(2);
      expect(mockManager.update).toHaveBeenCalled();
    });
  });

  describe('process - re-enqueue on pending events', () => {
    it('should re-enqueue job when there are pending events that could not be processed', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const operation = createMockOperation({
        externalId,
        currentState: OperationState.PROCESSING,
      });

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.OPERATION_CREATED, // Invalid transition
        isProcessed: false,
      });

      mockQueryBuilder.getOne.mockResolvedValue(operation);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);
      (stateMachine.canTransition as jest.Mock).mockReturnValue(false);
      (operationRepository.findOne as jest.Mock).mockResolvedValue(operation);

      await processor.process(job);

      expect(queue.add).toHaveBeenCalledWith(
        'process-transition',
        { external_id: externalId },
        expect.objectContaining({
          delay: 500,
        }),
      );
    });

    it('should not re-enqueue if operation is in final state', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const operation = createMockOperation({
        externalId,
        currentState: OperationState.COMPLETED, // Final state
      });

      const event = createMockOperationEvent({
        externalId,
        eventType: EventType.OPERATION_CREATED,
        isProcessed: false,
      });

      mockQueryBuilder.getOne.mockResolvedValue(operation);
      (mockManager.find as jest.Mock).mockResolvedValue([event]);
      (operationRepository.findOne as jest.Mock).mockResolvedValue(operation);

      await processor.process(job);

      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('process - error handling', () => {
    it('should throw error when processing fails', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const error = new Error('Database error');
      (dataSource.transaction as jest.Mock).mockRejectedValue(error);

      await expect(processor.process(job)).rejects.toThrow('Database error');
    });
  });

  describe('process - no unprocessed events', () => {
    it('should return early when there are no unprocessed events', async () => {
      const externalId = 'op-123';
      const job = createMockJob({ external_id: externalId }) as Job;

      const operation = createMockOperation({
        externalId,
        currentState: OperationState.PROCESSING,
      });

      mockQueryBuilder.getOne.mockResolvedValue(operation);
      (mockManager.find as jest.Mock).mockResolvedValue([]);

      await processor.process(job);

      expect(stateMachine.applyTransition).not.toHaveBeenCalled();
      expect(mockManager.update).not.toHaveBeenCalled();
    });
  });
});
