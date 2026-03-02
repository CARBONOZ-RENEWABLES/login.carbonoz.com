import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MeterDto {
  @ApiPropertyOptional({
    type: String,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsString()
  meterId?: string;

  @ApiPropertyOptional({
    type: String,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsString()
  meterBrand?: string;

  @ApiPropertyOptional({
    type: String,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsString()
  meterType?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'path/to/metering/evidence/photo',
  })
  meteringEvidencePhotoUpload: string;
}
