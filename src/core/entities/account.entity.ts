import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid', { name: 'account_id' })
  accountId: string;

  @Column({ name: 'external_id', type: 'varchar', length: 255, unique: true })
  @Index()
  externalId: string;

  @Column({ name: 'account_number', type: 'varchar', length: 50, unique: true })
  @Index()
  accountNumber: string;

  @Column({ name: 'holder_name', type: 'varchar', length: 255 })
  holderName: string;

  @Column({ type: 'decimal', precision: 19, scale: 2, default: 0 })
  balance: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
