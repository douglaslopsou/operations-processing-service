import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('operation_events')
@Index(['externalId', 'isProcessed'])
@Index(['externalId', 'eventType', 'payloadHash', 'isProcessed'])
export class OperationEvent {
  @PrimaryGeneratedColumn('uuid', { name: 'operation_event_id' })
  operationEventId: string;

  @Column({ name: 'external_id', type: 'varchar', length: 255 })
  @Index()
  externalId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: any;

  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash: string;

  @Column({ name: 'is_processed', type: 'boolean', default: false })
  isProcessed: boolean;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt: Date;

  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId: string;

  @Column({
    name: 'operation_type',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  operationType: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
