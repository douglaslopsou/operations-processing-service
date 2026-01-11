import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Account } from './account.entity';

@Entity('operations')
@Index(['currentState'])
export class Operation {
  @ApiProperty({
    description: 'Operation UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @PrimaryGeneratedColumn('uuid', { name: 'operation_id' })
  operationId: string;

  @ApiProperty({
    description: 'External ID for the operation',
    example: 'op-123',
  })
  @Column({ name: 'external_id', type: 'varchar', length: 255, unique: true })
  @Index()
  externalId: string;

  @ApiProperty({
    description: 'Account UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @Column({ name: 'account_id', type: 'uuid' })
  @Index()
  accountId: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @ApiProperty({
    description: 'Type of operation',
    example: 'CREDIT',
    enum: ['CREDIT', 'DEBIT'],
  })
  @Column({ name: 'operation_type', type: 'varchar', length: 20 })
  operationType: string;

  @ApiProperty({
    description: 'Current state of the operation',
    example: 'CREATED',
    enum: ['CREATED', 'PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED'],
  })
  @Column({ name: 'current_state', type: 'varchar', length: 50 })
  currentState: string;

  @ApiProperty({
    description: 'Operation amount',
    example: 100.5,
    nullable: true,
  })
  @Column({ type: 'decimal', precision: 19, scale: 2, nullable: true })
  amount: number;

  @ApiProperty({
    description: 'Currency code (ISO 4217)',
    example: 'USD',
    nullable: true,
  })
  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string;

  @ApiProperty({
    description: 'Operation version (for optimistic locking)',
    example: 1,
  })
  @Column({ type: 'int', default: 1 })
  version: number;

  @ApiProperty({
    description: 'Operation creation timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({
    description: 'Operation last update timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
