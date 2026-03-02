import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CertificationDto {
  @ApiPropertyOptional({
    type: String,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsString()
  powerPurchaseAgreement?: string;

  @ApiPropertyOptional({
    type: String,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsString()
  interconnectionAgreement?: string;

  @ApiPropertyOptional({
    type: String,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsString()
  commissioningCertificationToGrid?: string;

  @ApiPropertyOptional({
    type: String,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsString()
  commissioningCertificationOrInspection?: string;

  @ApiPropertyOptional({
    type: String,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsString()
  powerQualityTest?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String, required: true, default: 'Testing.jpg' })
  IDPhotoUploadorCompanyCertificate: string;
}
