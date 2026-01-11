import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAccountDto {
  @ApiProperty({
    description: 'Updated name of the account holder',
    example: 'Jane Doe',
  })
  @IsString()
  @IsNotEmpty()
  holderName: string;
}
