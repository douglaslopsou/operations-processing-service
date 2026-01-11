import { Injectable } from '@nestjs/common';
import { OperationState } from '../../core/enums/operation-state.enum';
import { EventType } from '../../core/enums/event-type.enum';
import { StateTransitionValidator } from './state-transition.validator';

@Injectable()
export class OperationStateMachine {
  constructor(private validator: StateTransitionValidator) {}

  applyTransition(
    currentState: OperationState | null,
    eventType: EventType,
  ): OperationState {
    if (!this.validator.canTransition(currentState, eventType)) {
      throw new Error(
        `Invalid transition from ${currentState} with event ${eventType}`,
      );
    }

    switch (eventType) {
      case EventType.OPERATION_CREATED:
        return OperationState.PENDING;

      case EventType.PROCESSING_STARTED:
        return OperationState.PROCESSING;

      case EventType.PROCESSING_COMPLETED:
        return OperationState.COMPLETED;

      case EventType.PROCESSING_REJECTED:
        return OperationState.REJECTED;

      default:
        throw new Error(`Unknown event type: ${eventType}`);
    }
  }

  canTransition(
    currentState: OperationState | null,
    eventType: EventType,
  ): boolean {
    return this.validator.canTransition(currentState, eventType);
  }
}
