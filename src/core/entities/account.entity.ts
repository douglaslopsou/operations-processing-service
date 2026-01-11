import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('accounts')
export class Account {
  @ApiProperty({
    description: 'Account UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @PrimaryGeneratedColumn('uuid', { name: 'account_id' })
  accountId: string;

  @ApiProperty({
    description: 'External ID for the account',
    example: 'acc-123',
  })
  @Column({ name: 'external_id', type: 'varchar', length: 255, unique: true })
  @Index()
  externalId: string;

  @ApiProperty({
    description: 'Account number (auto-generated)',
    example: '0000001000',
  })
  @Column({ name: 'account_number', type: 'varchar', length: 50, unique: true })
  @Index()
  accountNumber: string;

  @ApiProperty({
    description: 'Name of the account holder',
    example: 'John Doe',
  })
  @Column({ name: 'holder_name', type: 'varchar', length: 255 })
  holderName: string;

  @ApiProperty({
    description: 'Current account balance',
    example: 1000.5,
  })
  @Column({ type: 'decimal', precision: 19, scale: 2, default: 0 })
  balance: number;

  @ApiProperty({
    description: 'Currency code (ISO 4217)',
    example: 'USD',
    minLength: 3,
    maxLength: 3,
  })
  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({
    description: 'Account last update timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
