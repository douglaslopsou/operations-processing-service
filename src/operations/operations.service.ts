import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Account } from '../core/entities/account.entity';
import { Operation } from '../core/entities/operation.entity';
import { OperationEvent } from '../core/entities/operation-event.entity';
import { CreateOperationDto } from './dto/create-operation.dto';
import { EventType } from '../core/enums/event-type.enum';
import { OperationState } from '../core/enums/operation-state.enum';
import { FINAL_STATES } from '../core/enums/operation-state.enum';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);

  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
    @InjectRepository(Operation)
    private operationRepository: Repository<Operation>,
    @InjectRepository(OperationEvent)
    private eventRepository: Repository<OperationEvent>,
    @InjectQueue('operation-state-transitions')
    private queue: Queue,
  ) {}

  async createOperation(dto: CreateOperationDto) {
    this.logger.log(
      `Creating operation: externalId=${dto.externalId}, accountId=${dto.accountId}, type=${dto.operationType}, amount=${dto.amount}, currency=${dto.currency}`,
    );

    return await this.dataSource.transaction(async (manager) => {
      // 1. Check if account exists
      this.logger.debug(
        `Step 1: Checking if account exists: accountId=${dto.accountId}`,
      );
      const account = await manager.findOne(Account, {
        where: { accountId: dto.accountId },
      });

      if (!account) {
        this.logger.warn(`Account not found: accountId=${dto.accountId}`);
        throw new NotFoundException('Account not found');
      }
      this.logger.debug(`Account found: accountId=${account.accountId}`);

      // 2. Acquire pessimistic lock on operation (if it exists)
      this.logger.debug(
        `Step 2: Acquiring pessimistic lock for operation: externalId=${dto.externalId}`,
      );
      const operation = await manager
        .createQueryBuilder()
        .select('operation')
        .from(Operation, 'operation')
        .where('operation.external_id = :externalId', {
          externalId: dto.externalId,
        })
        .setLock('pessimistic_write')
        .getOne();

      // 3. If operation exists and is in final state, reject
      if (
        operation &&
        FINAL_STATES.includes(operation.currentState as OperationState)
      ) {
        this.logger.warn(
          `Operation already in final state: externalId=${dto.externalId}, state=${operation.currentState}`,
        );
        throw new UnprocessableEntityException('Operation in final state');
      }

      if (operation) {
        this.logger.debug(
          `Existing operation found: externalId=${dto.externalId}, currentState=${operation.currentState}`,
        );
      } else {
        this.logger.debug(
          `No existing operation found: externalId=${dto.externalId}, will create new operation`,
        );
      }

      // 4. Calculate payload hash for deduplication
      this.logger.debug(`Step 4: Calculating payload hash for deduplication`);
      const payload = {
        amount: dto.amount,
        currency: dto.currency,
      };
      const payloadHash = this.calculatePayloadHash(payload);
      this.logger.debug(
        `Payload hash calculated: ${payloadHash.substring(0, 8)}...`,
      );

      // 5. Always insert operation_created event (no unique constraint)
      this.logger.debug(
        `Step 5: Creating OPERATION_CREATED event: externalId=${dto.externalId}`,
      );
      const event = await manager.save(OperationEvent, {
        externalId: dto.externalId,
        eventType: EventType.OPERATION_CREATED,
        payload,
        payloadHash: payloadHash,
        isProcessed: false,
        accountId: account.accountId,
        operationType: dto.operationType,
      });
      this.logger.log(
        `OPERATION_CREATED event created: eventId=${event.operationEventId}, externalId=${dto.externalId}`,
      );

      // 6. If operation doesn't exist, create operation in PENDING state
      if (!operation) {
        this.logger.debug(
          `Step 6: Creating new operation with PENDING state: externalId=${dto.externalId}`,
        );
        await manager.save(Operation, {
          externalId: dto.externalId,
          accountId: account.accountId,
          operationType: dto.operationType,
          currentState: OperationState.PENDING,
          amount: dto.amount,
          currency: dto.currency,
          version: 1,
        });
        this.logger.log(
          `New operation created: externalId=${dto.externalId}, state=PENDING`,
        );
      }

      // 7. Enqueue processing (outside transaction)
      this.logger.debug(
        `Step 7: Enqueuing processing job: externalId=${dto.externalId}`,
      );
      await this.queue.add('process-transition', {
        external_id: dto.externalId,
      });
      this.logger.log(`Processing job enqueued: externalId=${dto.externalId}`);

      this.logger.log(
        `Operation creation completed successfully: externalId=${dto.externalId}`,
      );
      return { status: 202, event };
    });
  }

  private calculatePayloadHash(payload: any): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}
