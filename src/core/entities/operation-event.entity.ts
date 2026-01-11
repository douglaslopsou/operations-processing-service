import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('operation_events')
@Index(['external_id', 'is_processed'])
@Index(['external_id', 'event_type', 'payload_hash', 'is_processed'])
export class OperationEvent {
  @PrimaryGeneratedColumn('uuid')
  operation_event_id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  external_id: string;

  @Column({ type: 'varchar', length: 100 })
  event_type: string;

  @Column({ type: 'jsonb' })
  payload: any;

  @Column({ type: 'varchar', length: 64 })
  payload_hash: string;

  @Column({ type: 'boolean', default: false })
  is_processed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  processed_at: Date;

  @Column({ type: 'uuid', nullable: true })
  account_id: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  operation_type: string;

  @CreateDateColumn()
  created_at: Date;
}

