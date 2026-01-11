import {
  IsString,
  IsEnum,
  IsNumber,
  IsNotEmpty,
  IsUUID,
} from 'class-validator';
import { OperationType } from '../../core/enums/operation-type.enum';

export class CreateOperationDto {
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @IsUUID()
  @IsNotEmpty()
  accountId: string;

  @IsEnum(OperationType)
  operationType: OperationType;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  currency: string;
}
