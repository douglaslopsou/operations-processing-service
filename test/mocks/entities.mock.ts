import { Account } from '../../src/core/entities/account.entity';
import { Operation } from '../../src/core/entities/operation.entity';
import { OperationEvent } from '../../src/core/entities/operation-event.entity';
import { OperationType } from '../../src/core/enums/operation-type.enum';
import { OperationState } from '../../src/core/enums/operation-state.enum';
import { EventType } from '../../src/core/enums/event-type.enum';

export function createMockAccount(overrides?: Partial<Account>): Account {
  return {
    accountId: '123e4567-e89b-12d3-a456-426614174000',
    externalId: 'acc-123',
    accountNumber: '0000001000',
    holderName: 'John Doe',
    balance: 1000.5,
    currency: 'USD',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  } as Account;
}

export function createMockOperation(overrides?: Partial<Operation>): Operation {
  return {
    operationId: '456e7890-e89b-12d3-a456-426614174001',
    externalId: 'op-123',
    accountId: '123e4567-e89b-12d3-a456-426614174000',
    operationType: OperationType.CREDIT,
    currentState: OperationState.CREATED,
    amount: 100.5,
    currency: 'USD',
    version: 1,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    account: createMockAccount(),
    ...overrides,
  } as Operation;
}

export function createMockOperationEvent(
  overrides?: Partial<OperationEvent>,
): OperationEvent {
  return {
    operationEventId: '789e0123-e89b-12d3-a456-426614174002',
    externalId: 'op-123',
    eventType: EventType.OPERATION_CREATED,
    payload: { amount: 100.5, currency: 'USD' },
    payloadHash: 'abc123def456',
    isProcessed: false,
    processedAt: null,
    accountId: '123e4567-e89b-12d3-a456-426614174000',
    operationType: OperationType.CREDIT,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  } as OperationEvent;
}
