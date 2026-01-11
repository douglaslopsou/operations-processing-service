import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationsModule } from './operations/operations.module';
import { AccountsModule } from './accounts/accounts.module';
import { Account } from './core/entities/account.entity';
import { Operation } from './core/entities/operation.entity';
import { OperationEvent } from './core/entities/operation-event.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5433', 10),
      username: process.env.DATABASE_USER || 'operations_user',
      password: process.env.DATABASE_PASSWORD || 'operations_pass',
      database: process.env.DATABASE_NAME || 'operations_db',
      entities: [Account, Operation, OperationEvent],
      synchronize: false,
      logging: process.env.NODE_ENV === 'development',
    }),
    AccountsModule,
    OperationsModule,
  ],
})
export class AppModule {}
