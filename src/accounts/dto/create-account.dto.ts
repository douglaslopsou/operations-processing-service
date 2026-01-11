import {
  IsString,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  Length,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAccountDto {
  @ApiProperty({
    description: 'External ID for the account',
    example: 'acc-123',
  })
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @ApiProperty({
    description: 'Name of the account holder',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  holderName: string;

  @ApiPropertyOptional({
    description: 'Initial balance of the account',
    example: 0,
    default: 0,
    minimum: 0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  balance?: number;

  @ApiProperty({
    description: 'Currency code (ISO 4217)',
    example: 'USD',
    minLength: 3,
    maxLength: 3,
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 3)
  currency: string;
}
