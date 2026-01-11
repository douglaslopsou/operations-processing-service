import {
  IsString,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  Length,
  Min,
} from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @IsString()
  @IsNotEmpty()
  holderName: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  balance?: number;

  @IsString()
  @IsNotEmpty()
  @Length(3, 3)
  currency: string;
}
