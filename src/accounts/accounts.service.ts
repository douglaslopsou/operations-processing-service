import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Account } from '../core/entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async findAll(): Promise<Account[]> {
    return this.accountRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Account> {
    const account = await this.accountRepository.findOne({
      where: { accountId: id },
    });

    if (!account) {
      throw new NotFoundException(`Account with ID ${id} not found`);
    }

    return account;
  }

  async findByExternalId(externalId: string): Promise<Account> {
    const account = await this.accountRepository.findOne({
      where: { externalId },
    });

    if (!account) {
      throw new NotFoundException(
        `Account with external_id ${externalId} not found`,
      );
    }

    return account;
  }

  async create(createAccountDto: CreateAccountDto): Promise<Account> {
    const existingAccount = await this.accountRepository.findOne({
      where: { externalId: createAccountDto.externalId },
    });

    if (existingAccount) {
      throw new ConflictException(
        `Account with external_id ${createAccountDto.externalId} already exists`,
      );
    }

    // Generate account number using sequence
    const result = await this.dataSource.query(
      "SELECT LPAD(nextval('account_number_seq')::text, 10, '0') as account_number",
    );
    const accountNumber = result[0].account_number;

    const account = this.accountRepository.create({
      externalId: createAccountDto.externalId,
      accountNumber: accountNumber,
      holderName: createAccountDto.holderName,
      balance: createAccountDto.balance ?? 0,
      currency: createAccountDto.currency,
    });

    return this.accountRepository.save(account);
  }

  async update(
    id: string,
    updateAccountDto: UpdateAccountDto,
  ): Promise<Account> {
    const account = await this.findOne(id);

    account.holderName = updateAccountDto.holderName;

    return this.accountRepository.save(account);
  }

  async remove(id: string): Promise<void> {
    const account = await this.findOne(id);
    await this.accountRepository.remove(account);
  }
}
