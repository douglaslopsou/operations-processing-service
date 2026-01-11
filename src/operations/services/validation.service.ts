import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
    manager?: EntityManager,
  ): Promise<EventType.PROCESSING_COMPLETED | EventType.PROCESSING_REJECTED> {
    this.logger.debug(
      `Starting validation for operation: externalId=${operation.externalId}, accountId=${operation.accountId}, type=${operation.operationType}, amount=${operation.amount}`,
    );

    // 1. Load account with lock to avoid race conditions
    this.logger.debug(
      `Step 1: Loading account with pessimistic lock: accountId=${operation.accountId}`,
    );
    const accountRepository = manager
      ? manager.getRepository(Account)
      : this.accountRepository;
    const account = await accountRepository.findOne({
      where: { accountId: operation.accountId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!account) {
      this.logger.error(
        `Validation failed: Account not found: accountId=${operation.accountId}, externalId=${operation.externalId}`,
      );
      return EventType.PROCESSING_REJECTED;
    }
    this.logger.debug(
      `Account loaded: accountId=${account.accountId}, balance=${account.balance}, currency=${account.currency}`,
    );

    // 2. Validate currency
    this.logger.debug(
      `Step 2: Validating currency: operationCurrency=${operation.currency}, accountCurrency=${account.currency}`,
    );
    if (operation.currency !== account.currency) {
      this.logger.error(
        `Validation failed: Currency mismatch: externalId=${operation.externalId}, operationCurrency=${operation.currency}, accountCurrency=${account.currency}`,
      );
      return EventType.PROCESSING_REJECTED; // Different currencies
    }

    // 3. Validate amount (convert to number for comparison)
    const operationAmount = Number(operation.amount);
    this.logger.debug(`Step 3: Validating amount: amount=${operationAmount}`);
    if (operationAmount <= 0 || isNaN(operationAmount)) {
      this.logger.error(
        `Validation failed: Invalid amount: externalId=${operation.externalId}, amount=${operation.amount}`,
      );
      return EventType.PROCESSING_REJECTED; // Invalid amount
    }

    // 4. Validate balance for debit (convert to number for comparison)
    if (operation.operationType === OperationType.DEBIT) {
      const accountBalance = Number(account.balance);
      this.logger.debug(
        `Step 4: Validating balance for DEBIT operation: amount=${operationAmount}, balance=${accountBalance}`,
      );
      if (operationAmount > accountBalance) {
        this.logger.error(
          `Validation failed: Insufficient balance: externalId=${operation.externalId}, operationType=DEBIT, amount=${operationAmount}, accountBalance=${accountBalance}`,
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
