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
import { Account } from './account.entity';

@Entity('operations')
@Index(['currentState'])
export class Operation {
  @PrimaryGeneratedColumn('uuid', { name: 'operation_id' })
  operationId: string;

  @Column({ name: 'external_id', type: 'varchar', length: 255, unique: true })
  @Index()
  externalId: string;

  @Column({ name: 'account_id', type: 'uuid' })
  @Index()
  accountId: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ name: 'operation_type', type: 'varchar', length: 20 })
  operationType: string; // 'CREDIT' or 'DEBIT'

  @Column({ name: 'current_state', type: 'varchar', length: 50 })
  currentState: string; // 'PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED'

  @Column({ type: 'decimal', precision: 19, scale: 2, nullable: true })
  amount: number;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

