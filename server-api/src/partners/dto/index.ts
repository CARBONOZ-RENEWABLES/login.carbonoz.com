import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';

export class RegisterPartnerDto {
  @IsArray()
  @ApiProperty({ isArray: true, required: true })
  partner: string[];
}
