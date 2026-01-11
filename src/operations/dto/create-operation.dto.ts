import {
  IsString,
  IsEnum,
  IsNumber,
  IsNotEmpty,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OperationType } from '../../core/enums/operation-type.enum';

export class CreateOperationDto {
  @ApiProperty({
    description: 'External ID for the operation',
    example: 'op-123',
  })
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @ApiProperty({
    description: 'UUID of the account',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  accountId: string;

  @ApiProperty({
    description: 'Type of operation',
    enum: OperationType,
    example: OperationType.CREDIT,
  })
  @IsEnum(OperationType)
  operationType: OperationType;

  @ApiProperty({
    description: 'Amount of the operation',
    example: 100.5,
    minimum: 0.01,
  })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    description: 'Currency code (ISO 4217)',
    example: 'USD',
    minLength: 3,
    maxLength: 3,
  })
  @IsString()
  @IsNotEmpty()
  currency: string;
}
