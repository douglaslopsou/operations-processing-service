import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateOperationsTable1736935201000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'operations',
        columns: [
          {
            name: 'operation_id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'external_id',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'account_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'operation_type',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'current_state',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 19,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '3',
            isNullable: true,
          },
          {
            name: 'version',
            type: 'int',
            default: 1,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'operations',
      new TableForeignKey({
        columnNames: ['account_id'],
        referencedColumnNames: ['account_id'],
        referencedTableName: 'accounts',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'operations',
      new TableIndex({
        name: 'idx_operations_external_id',
        columnNames: ['external_id'],
      }),
    );

    await queryRunner.createIndex(
      'operations',
      new TableIndex({
        name: 'idx_operations_account_id',
        columnNames: ['account_id'],
      }),
    );

    await queryRunner.createIndex(
      'operations',
      new TableIndex({
        name: 'idx_operations_current_state',
        columnNames: ['current_state'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('operations');
  }
}

