import { DataSource, EntityManager, QueryBuilder, Repository } from 'typeorm';

export function createMockQueryBuilder<T = any>(): Partial<QueryBuilder<T>> {
  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
    getMany: jest.fn().mockResolvedValue([]),
  };

  return mockQueryBuilder;
}

export function createMockEntityManager(): Partial<EntityManager> {
  const mockQueryBuilder = createMockQueryBuilder();

  const mockManager = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((entity, data) =>
      Promise.resolve({ ...entity, ...data }),
    ),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    getRepository: jest.fn().mockReturnValue(createMockRepository()),
    increment: jest.fn().mockResolvedValue({ affected: 1 }),
    decrement: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  // Make query builder methods chainable
  mockManager.createQueryBuilder = jest
    .fn()
    .mockReturnValue(mockQueryBuilder);

  return mockManager;
}

export function createMockRepository<T = any>(): Partial<Repository<T>> {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    create: jest.fn().mockImplementation((data) => data),
    createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
    remove: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

export function createMockDataSource(): Partial<DataSource> {
  const mockManager = createMockEntityManager();

  return {
    transaction: jest
      .fn()
      .mockImplementation((fn: (manager: EntityManager) => Promise<any>) =>
        fn(mockManager as EntityManager),
      ),
    manager: mockManager as EntityManager,
    createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
  };
}

