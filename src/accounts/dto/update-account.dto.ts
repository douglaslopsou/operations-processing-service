import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateAccountDto {
  @IsString()
  @IsNotEmpty()
  holderName: string;
}
