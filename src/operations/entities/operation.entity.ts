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
@Index(['current_state'])
export class Operation {
  @PrimaryGeneratedColumn('uuid')
  operation_id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index()
  external_id: string;

  @Column({ type: 'uuid' })
  @Index()
  account_id: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ type: 'varchar', length: 20 })
  operation_type: string; // 'CREDIT' or 'DEBIT'

  @Column({ type: 'varchar', length: 50 })
  current_state: string; // 'PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED'

  @Column({ type: 'decimal', precision: 19, scale: 2, nullable: true })
  amount: number;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

