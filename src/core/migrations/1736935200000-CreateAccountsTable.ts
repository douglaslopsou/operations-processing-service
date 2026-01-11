import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAccountsTable1736935200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create sequence for account numbers
    await queryRunner.query(`
      CREATE SEQUENCE IF NOT EXISTS account_number_seq
      START WITH 1000
      INCREMENT BY 1
      NO MINVALUE
      NO MAXVALUE
      CACHE 1;
    `);

    await queryRunner.createTable(
      new Table({
        name: 'accounts',
        columns: [
          {
            name: 'account_id',
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
            name: 'account_number',
            type: 'varchar',
            length: '50',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'holder_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'balance',
            type: 'decimal',
            precision: 19,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '3',
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

    await queryRunner.createIndex(
      'accounts',
      new TableIndex({
        name: 'idx_accounts_external_id',
        columnNames: ['external_id'],
      }),
    );

    await queryRunner.createIndex(
      'accounts',
      new TableIndex({
        name: 'idx_accounts_account_number',
        columnNames: ['account_number'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('accounts');
    await queryRunner.query('DROP SEQUENCE IF EXISTS account_number_seq;');
  }
}

