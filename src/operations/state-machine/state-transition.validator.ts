import { Injectable } from '@nestjs/common';
import { OperationState } from '../../core/enums/operation-state.enum';
import { EventType } from '../../core/enums/event-type.enum';

@Injectable()
export class StateTransitionValidator {
  canTransition(
    currentState: OperationState | null,
    eventType: EventType,
  ): boolean {
    // NULL state - only operation_created is valid
    if (currentState === null) {
      return eventType === EventType.OPERATION_CREATED;
    }

    // Final states - no transitions allowed
    if (
      currentState === OperationState.COMPLETED ||
      currentState === OperationState.REJECTED
    ) {
      return false;
    }

    // CREATED state - only operation_created is valid
    if (currentState === OperationState.CREATED) {
      return eventType === EventType.OPERATION_CREATED;
    }

    // PENDING state - only processing_started is valid
    if (currentState === OperationState.PENDING) {
      return eventType === EventType.PROCESSING_STARTED;
    }

    // PROCESSING state - only processing_completed or processing_rejected are valid
    if (currentState === OperationState.PROCESSING) {
      return (
        eventType === EventType.PROCESSING_COMPLETED ||
        eventType === EventType.PROCESSING_REJECTED
      );
    }

    return false;
  }
}
