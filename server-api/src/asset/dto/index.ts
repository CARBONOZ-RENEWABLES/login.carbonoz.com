import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EFuelType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

/** Offsetting details: all optional, saved as far as the customer fills them in. */
export class RegisterUserAssetsDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'BBox',
  })
  assetName?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'Carbonoz',
  })
  assetOwner?: string;

  @IsOptional()
  @IsEnum(EFuelType)
  @ApiProperty({ required: false, enum: EFuelType })
  fuelType?: EFuelType;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'Rwanda',
  })
  country?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    type: Number,
    required: false,
    default: -1.2921,
  })
  latitude?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    type: Number,
    required: false,
    default: 36.8219,
  })
  longitude?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    type: Number,
    required: false,
    default: 24.0,
  })
  capacityKwp?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'Service',
  })
  service?: string;

  @IsDateString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: '2024-01-01T00:00:00Z',
  })
  codDate?: Date;

  @IsInt()
  @IsOptional()
  @ApiProperty({
    type: Number,
    required: false,
    default: 10,
  })
  amountOfInverters?: number;

  @IsInt()
  @IsOptional()
  @ApiProperty({
    type: Number,
    required: false,
    default: 20,
  })
  amountOfPanels?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'BrandX',
  })
  panelBrand?: string;

  @IsInt()
  @IsOptional()
  @ApiProperty({
    type: Number,
    required: false,
    default: 300,
  })
  panelPower?: number;

  @ApiPropertyOptional({
    type: Number,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsInt()
  amountOfBatteries?: number;

  @ApiPropertyOptional({
    type: String,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsString()
  batteryBrand?: string;

  @ApiPropertyOptional({
    type: String,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsString()
  batteryModel?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'ModelX',
  })
  inverterModel?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'MonitoringSystemX',
  })
  monitoringSystemName?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'http://example.com',
  })
  monitoringSystemURL?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'path/to/building/photo',
  })
  buildingPhotoUpload?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'path/to/inverter/setup/photo',
  })
  inverterSetupPhotoUpload?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'path/to/solar/panels/photo',
  })
  solarPanelsPhotoUpload?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'SolarTx',
  })
  inverterBrand?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'SerialNumber1',
  })
  BatterySerialNumber1?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'SerialNumber2',
  })
  BatterySerialNumber2?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'SerialNumber3',
  })
  BatterySerialNumber3?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'SerialNumber1',
  })
  InverterSerialnumber1?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'SerialNumber2',
  })
  InverterSerialnumber2?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    default: 'SerialNumber3',
  })
  InverterSerialnumber3?: string;
}
