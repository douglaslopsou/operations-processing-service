export enum OperationState {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

export const FINAL_STATES = [OperationState.COMPLETED, OperationState.REJECTED];

