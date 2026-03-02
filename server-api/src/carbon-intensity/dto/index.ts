import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CarbonIntensityQueryDTO {
  @ApiProperty({ required: true })
  @IsString()
  zone: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  timezone?: string;
}
