import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Account } from '../core/entities/account.entity';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new account' })
  @ApiResponse({
    status: 201,
    description: 'Account created successfully',
    type: Account,
  })
  @ApiResponse({
    status: 409,
    description: 'Account with externalId already exists',
  })
  async create(@Body() createAccountDto: CreateAccountDto): Promise<Account> {
    return this.accountsService.create(createAccountDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all accounts' })
  @ApiResponse({
    status: 200,
    description: 'List of accounts',
    type: [Account],
  })
  async findAll(): Promise<Account[]> {
    return this.accountsService.findAll();
  }

  @Get('external/:externalId')
  @ApiOperation({ summary: 'Find account by external ID' })
  @ApiParam({
    name: 'externalId',
    description: 'External ID of the account',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Account found',
    type: Account,
  })
  @ApiResponse({
    status: 404,
    description: 'Account not found',
  })
  async findByExternalId(
    @Param('externalId') externalId: string,
  ): Promise<Account> {
    return this.accountsService.findByExternalId(externalId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get account by ID' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the account',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Account found',
    type: Account,
  })
  @ApiResponse({
    status: 404,
    description: 'Account not found',
  })
  async findOne(@Param('id') id: string): Promise<Account> {
    return this.accountsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update account holder name' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the account',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Account updated successfully',
    type: Account,
  })
  @ApiResponse({
    status: 404,
    description: 'Account not found',
  })
  async update(
    @Param('id') id: string,
    @Body() updateAccountDto: UpdateAccountDto,
  ): Promise<Account> {
    return this.accountsService.update(id, updateAccountDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an account' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the account',
    type: String,
  })
  @ApiResponse({
    status: 204,
    description: 'Account deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Account not found',
  })
  async remove(@Param('id') id: string): Promise<void> {
    return this.accountsService.remove(id);
  }
}
