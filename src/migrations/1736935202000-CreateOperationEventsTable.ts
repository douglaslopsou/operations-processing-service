import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateOperationEventsTable1736935202000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'operation_events',
        columns: [
          {
            name: 'operation_event_id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'external_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'event_type',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'payload',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'payload_hash',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'is_processed',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'processed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'account_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'operation_type',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'operation_events',
      new TableIndex({
        name: 'idx_operation_events_external_id_processed',
        columnNames: ['external_id', 'is_processed'],
      }),
    );

    await queryRunner.createIndex(
      'operation_events',
      new TableIndex({
        name: 'idx_operation_events_deduplication',
        columnNames: [
          'external_id',
          'event_type',
          'payload_hash',
          'is_processed',
        ],
      }),
    );

    await queryRunner.createIndex(
      'operation_events',
      new TableIndex({
        name: 'idx_operation_events_external_id',
        columnNames: ['external_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('operation_events');
  }
}
