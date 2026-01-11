import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
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
import { InjectQueue } from '@nestjs/bullmq';
import * as crypto from 'crypto';

@Processor('operation-state-transitions')
export class OperationStateProcessor extends WorkerHost {
  private readonly logger = new Logger(OperationStateProcessor.name);

  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    @InjectRepository(Operation)
    private operationRepository: Repository<Operation>,
    @InjectRepository(OperationEvent)
    private eventRepository: Repository<OperationEvent>,
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
    private stateMachine: OperationStateMachine,
    private validationService: ValidationService,
    @InjectQueue('operation-state-transitions')
    private queue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ external_id: string }>): Promise<void> {
    const { external_id } = job.data;
    this.logger.log(`Processing transition for external_id: ${external_id}`);

    let hasMorePendingEvents = false;

    try {
      // Execute ALL operations in a single transaction with pessimistic lock
      this.logger.debug(`Starting transaction for externalId: ${external_id}`);
      await this.dataSource.transaction(async (manager) => {
        // Pessimistic lock on operation (SELECT FOR UPDATE ensures exclusivity)
        this.logger.debug(
          `Step 1: Acquiring pessimistic lock for operation: externalId=${external_id}`,
        );
        const operation = await manager
          .createQueryBuilder()
          .select('operation')
          .from(Operation, 'operation')
          .where('operation.external_id = :externalId', {
            externalId: external_id,
          })
          .setLock('pessimistic_write')
          .getOne();

        // If operation is in final state, mark pending events as processed
        if (
          operation &&
          FINAL_STATES.includes(operation.currentState as OperationState)
        ) {
          this.logger.warn(
            `Operation already in final state, marking pending events as processed: externalId=${external_id}, state=${operation.currentState}`,
          );
          await manager.update(
            OperationEvent,
            { externalId: external_id, isProcessed: false },
            { isProcessed: true, processedAt: new Date() },
          );
          return; // Abort processing
        }

        if (operation) {
          this.logger.debug(
            `Operation found: externalId=${external_id}, currentState=${operation.currentState}, version=${operation.version}`,
          );
        } else {
          this.logger.debug(
            `No operation found for externalId: ${external_id}`,
          );
        }

        // Load unprocessed events
        this.logger.debug(
          `Step 2: Loading unprocessed events: externalId=${external_id}`,
        );
        const unprocessedEvents = await manager.find(OperationEvent, {
          where: { externalId: external_id, isProcessed: false },
          order: { createdAt: 'ASC' },
        });

        if (unprocessedEvents.length === 0) {
          this.logger.debug(
            `No unprocessed events found for externalId: ${external_id}`,
          );
          return; // No events to process
        }

        this.logger.debug(
          `Found ${unprocessedEvents.length} unprocessed event(s) for externalId: ${external_id}`,
        );

        // Group by deduplication key
        this.logger.debug(
          `Step 3: Grouping events by deduplication key: externalId=${external_id}`,
        );
        const eventGroups = this.groupByDeduplicationKey(unprocessedEvents);
        this.logger.debug(
          `Grouped into ${eventGroups.length} unique event group(s) for externalId: ${external_id}`,
        );

        // Track operation state during processing
        let currentOperationState = operation?.currentState || null;
        this.logger.debug(
          `Starting state for processing: externalId=${external_id}, currentState=${currentOperationState}`,
        );

        // For each group, process only the first event
        this.logger.debug(
          `Step 4: Processing ${eventGroups.length} event group(s) for externalId: ${external_id}`,
        );
        for (const group of eventGroups) {
          const firstEvent = group[0];
          this.logger.debug(
            `Processing event group: externalId=${external_id}, eventId=${firstEvent.operationEventId}, eventType=${firstEvent.eventType}, groupSize=${group.length}`,
          );

          // Validate transition within transaction (double-check)
          this.logger.debug(
            `Validating transition: externalId=${external_id}, fromState=${currentOperationState}, eventType=${firstEvent.eventType}`,
          );
          const isValidTransition = this.stateMachine.canTransition(
            currentOperationState as OperationState | null,
            firstEvent.eventType as EventType,
          );

          if (!isValidTransition) {
            this.logger.warn(
              `Invalid transition skipped: externalId=${external_id}, fromState=${currentOperationState}, eventType=${firstEvent.eventType}`,
            );
            // Mark that there are pending events that couldn't be processed
            hasMorePendingEvents = true;
            continue; // Keep pending, will be retried
          }

          // Apply event to state machine
          this.logger.debug(
            `Applying state transition: externalId=${external_id}, fromState=${currentOperationState}, eventType=${firstEvent.eventType}`,
          );
          const newState = this.stateMachine.applyTransition(
            currentOperationState as OperationState | null,
            firstEvent.eventType as EventType,
          );
          this.logger.debug(
            `State transition result: externalId=${external_id}, newState=${newState}`,
          );

          // Fetch updated operation to verify state and get data
          const currentOperation = await manager.findOne(Operation, {
            where: { externalId: external_id },
          });

          // Check if state is already at expected result (idempotency)
          if (currentOperation && currentOperation.currentState === newState) {
            this.logger.debug(
              `State already at target (idempotent): externalId=${external_id}, state=${newState}, marking events as processed`,
            );
            // State is already at expected result, just mark as processed
            const eventIds = group.map((e) => e.operationEventId);
            await manager.update(
              OperationEvent,
              { operationEventId: In(eventIds) },
              { isProcessed: true, processedAt: new Date() },
            );
            this.logger.debug(
              `Marked ${eventIds.length} event(s) as processed (idempotent): externalId=${external_id}`,
            );
            // Update current state for next iteration even when idempotent
            currentOperationState = newState;
            continue;
          }

          // Update current state for next iteration
          currentOperationState = newState;
          this.logger.debug(
            `Updating operation state: externalId=${external_id}, newState=${newState}`,
          );

          // Update operation (create if it doesn't exist)
          const operationData: any = {
            externalId: external_id,
            currentState: newState,
            version: (currentOperation?.version || 0) + 1,
            updatedAt: new Date(),
          };

          // Extract data from operation_created event
          if (
            firstEvent.eventType === EventType.OPERATION_CREATED &&
            firstEvent.payload
          ) {
            operationData.amount = firstEvent.payload.amount;
            operationData.currency = firstEvent.payload.currency;
            operationData.accountId = firstEvent.accountId;
            operationData.operationType = firstEvent.operationType;
          } else if (currentOperation) {
            operationData.accountId = currentOperation.accountId;
            operationData.operationType = currentOperation.operationType;
            operationData.amount = currentOperation.amount;
            operationData.currency = currentOperation.currency;
          }

          if (currentOperation) {
            this.logger.debug(
              `Updating existing operation: externalId=${external_id}, version=${currentOperation.version} -> ${operationData.version}`,
            );
            await manager.update(
              Operation,
              { externalId: external_id },
              operationData,
            );
            this.logger.log(
              `Operation updated: externalId=${external_id}, state=${newState}, version=${operationData.version}`,
            );
          } else {
            this.logger.debug(
              `Creating new operation: externalId=${external_id}, state=${newState}`,
            );
            await manager.save(Operation, {
              ...operationData,
              createdAt: new Date(),
            });
            this.logger.log(
              `Operation created: externalId=${external_id}, state=${newState}`,
            );
          }

          // Account Balance Update (if state changed to COMPLETED)
          if (
            newState === OperationState.COMPLETED &&
            operationData.accountId
          ) {
            this.logger.debug(
              `Operation completed, updating account balance: externalId=${external_id}, accountId=${operationData.accountId}, type=${operationData.operationType}, amount=${operationData.amount}`,
            );
            const account = await manager.findOne(Account, {
              where: { accountId: operationData.accountId },
              lock: { mode: 'pessimistic_write' },
            });

            if (account) {
              const oldBalance = account.balance;
              if (operationData.operationType === OperationType.CREDIT) {
                await manager.increment(
                  Account,
                  { accountId: operationData.accountId },
                  'balance',
                  operationData.amount,
                );
                this.logger.log(
                  `Account balance credited: accountId=${operationData.accountId}, amount=${operationData.amount}, oldBalance=${oldBalance}`,
                );
              } else if (operationData.operationType === OperationType.DEBIT) {
                await manager.decrement(
                  Account,
                  { accountId: operationData.accountId },
                  'balance',
                  operationData.amount,
                );
                this.logger.log(
                  `Account balance debited: accountId=${operationData.accountId}, amount=${operationData.amount}, oldBalance=${oldBalance}`,
                );
              }
            } else {
              this.logger.warn(
                `Account not found for balance update: accountId=${operationData.accountId}`,
              );
            }
          }

          // Automatic Event Generation
          if (
            firstEvent.eventType === EventType.OPERATION_CREATED &&
            newState === OperationState.PENDING
          ) {
            // Automatically generate processing_started
            const processingStartedEvent = await manager.save(OperationEvent, {
              externalId: external_id,
              eventType: EventType.PROCESSING_STARTED,
              payload: {},
              payloadHash: this.calculatePayloadHash({}),
              isProcessed: false,
              accountId: operationData.accountId,
              operationType: operationData.operationType,
            });
            this.logger.log(
              `Auto-generated processing_started event: ${processingStartedEvent.operationEventId}`,
            );
          } else if (
            firstEvent.eventType === EventType.PROCESSING_STARTED &&
            newState === OperationState.PROCESSING
          ) {
            // Call internal service for validation
            const updatedOperation = await manager.findOne(Operation, {
              where: { externalId: external_id },
            });

            if (updatedOperation) {
              const validationResult =
                await this.validationService.validateOperation(
                  updatedOperation,
                  manager,
                );

              // Generate event based on validation
              const validationEvent = await manager.save(OperationEvent, {
                externalId: external_id,
                eventType: validationResult,
                payload: {},
                payloadHash: this.calculatePayloadHash({}),
                isProcessed: false,
                accountId: updatedOperation.accountId,
                operationType: updatedOperation.operationType,
              });
              this.logger.log(
                `Auto-generated ${validationResult} event: ${validationEvent.operationEventId}`,
              );
            }
          }

          // Mark ALL events in group as processed
          this.logger.debug(
            `Marking event group as processed: externalId=${external_id}, eventCount=${group.length}`,
          );
          const eventIds = group.map((e) => e.operationEventId);
          await manager.update(
            OperationEvent,
            { operationEventId: In(eventIds) },
            { isProcessed: true, processedAt: new Date() },
          );
          this.logger.debug(
            `Event group marked as processed: externalId=${external_id}, eventIds=${eventIds.join(',')}`,
          );
        }

        // Check if there are still pending events after processing all groups
        this.logger.debug(
          `Checking for remaining pending events: externalId=${external_id}`,
        );
        const remainingPendingEvents = await manager.find(OperationEvent, {
          where: { externalId: external_id, isProcessed: false },
          take: 1,
        });

        if (remainingPendingEvents.length > 0) {
          this.logger.debug(
            `Remaining pending events found: externalId=${external_id}`,
          );
          hasMorePendingEvents = true;
        } else {
          this.logger.debug(
            `No remaining pending events: externalId=${external_id}`,
          );
        }

        // Single COMMIT for all operations
        this.logger.debug(`Committing transaction: externalId=${external_id}`);
      });

      // If there are pending events that couldn't be processed,
      // re-enqueue a job to try processing them again
      // (but only if the operation is not in a final state)
      if (hasMorePendingEvents) {
        const operation = await this.operationRepository.findOne({
          where: { externalId: external_id },
        });

        if (
          !operation ||
          !FINAL_STATES.includes(operation.currentState as OperationState)
        ) {
          this.logger.log(
            `Re-enqueuing job for ${external_id} due to pending events`,
          );
          await this.queue.add(
            'process-transition',
            { external_id },
            {
              delay: 500, // Small delay to avoid immediate processing
              jobId: `retry-${external_id}-${Date.now()}`, // Unique ID to avoid duplicates
            },
          );
        }
      }

      this.logger.log(`Successfully processed transition for: ${external_id}`);
    } catch (error) {
      this.logger.error(
        `Error processing transition for ${external_id}:`,
        error,
      );
      throw error;
    }
  }

  private groupByDeduplicationKey(
    events: OperationEvent[],
  ): OperationEvent[][] {
    const groups = new Map<string, OperationEvent[]>();

    for (const event of events) {
      const key = `${event.externalId}:${event.eventType}:${event.payloadHash}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(event);
    }

    return Array.from(groups.values());
  }

  private calculatePayloadHash(payload: any): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}
