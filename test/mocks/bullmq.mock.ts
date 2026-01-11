import { Queue, Job } from 'bullmq';

export function createMockJob<T = any>(data: T = {} as T): Partial<Job<T>> {
  return {
    id: 'job-123',
    data: data as T,
    name: 'process-transition',
    progress: jest.fn().mockResolvedValue(undefined),
    updateProgress: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    retry: jest.fn().mockResolvedValue(undefined),
    discard: jest.fn().mockResolvedValue(undefined),
  };
}

export function createMockQueue<T = any>(): Partial<Queue<T>> {
  return {
    add: jest.fn().mockResolvedValue(createMockJob()),
    getJob: jest.fn().mockResolvedValue(null),
    getJobs: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(undefined),
    clean: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    isPaused: jest.fn().mockResolvedValue(false),
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
  };
}
