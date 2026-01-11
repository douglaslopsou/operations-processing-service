import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { OperationStateProcessor } from './processors/operation-state.processor';
import { Account } from '../core/entities/account.entity';
import { Operation } from '../core/entities/operation.entity';
import { OperationEvent } from '../core/entities/operation-event.entity';
import { ValidationService } from './services/validation.service';
import { OperationStateMachine } from './state-machine/operation-state-machine';
import { StateTransitionValidator } from './state-machine/state-transition.validator';
import { bullmqConfig } from '../config/bullmq.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, Operation, OperationEvent]),
    BullModule.forRoot(bullmqConfig),
    BullModule.registerQueue({
      name: 'operation-state-transitions',
    }),
  ],
  controllers: [OperationsController],
  providers: [
    OperationsService,
    OperationStateProcessor,
    ValidationService,
    OperationStateMachine,
    StateTransitionValidator,
  ],
})
export class OperationsModule {}
