import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../../core/entities/account.entity';
import { Operation } from '../../core/entities/operation.entity';
import { OperationType } from '../../core/enums/operation-type.enum';
import { EventType } from '../../core/enums/event-type.enum';

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
  ) {}

  async validateOperation(
    operation: Operation,
  ): Promise<EventType.PROCESSING_COMPLETED | EventType.PROCESSING_REJECTED> {
    this.logger.debug(
      `Starting validation for operation: externalId=${operation.externalId}, accountId=${operation.accountId}, type=${operation.operationType}, amount=${operation.amount}`,
    );

    // 1. Load account with lock to avoid race conditions
    this.logger.debug(
      `Step 1: Loading account with pessimistic lock: accountId=${operation.accountId}`,
    );
    const account = await this.accountRepository.findOne({
      where: { accountId: operation.accountId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!account) {
      this.logger.warn(
        `Validation failed: Account not found: accountId=${operation.accountId}`,
      );
      return EventType.PROCESSING_REJECTED; // Account not found
    }
    this.logger.debug(
      `Account loaded: accountId=${account.accountId}, balance=${account.balance}, currency=${account.currency}`,
    );

    // 2. Validate currency
    this.logger.debug(
      `Step 2: Validating currency: operationCurrency=${operation.currency}, accountCurrency=${account.currency}`,
    );
    if (operation.currency !== account.currency) {
      this.logger.warn(
        `Validation failed: Currency mismatch: operationCurrency=${operation.currency}, accountCurrency=${account.currency}`,
      );
      return EventType.PROCESSING_REJECTED; // Different currencies
    }

    // 3. Validate amount
    this.logger.debug(`Step 3: Validating amount: amount=${operation.amount}`);
    if (operation.amount <= 0) {
      this.logger.warn(
        `Validation failed: Invalid amount: amount=${operation.amount}`,
      );
      return EventType.PROCESSING_REJECTED; // Invalid amount
    }

    // 4. Validate balance for debit
    if (operation.operationType === OperationType.DEBIT) {
      this.logger.debug(
        `Step 4: Validating balance for DEBIT operation: amount=${operation.amount}, balance=${account.balance}`,
      );
      if (operation.amount > account.balance) {
        this.logger.warn(
          `Validation failed: Insufficient balance: amount=${operation.amount}, balance=${account.balance}`,
        );
        return EventType.PROCESSING_REJECTED; // Insufficient balance
      }
    }

    // 5. All validations passed
    this.logger.log(
      `Validation completed successfully: externalId=${operation.externalId}, result=PROCESSING_COMPLETED`,
    );
    return EventType.PROCESSING_COMPLETED;
  }
}

