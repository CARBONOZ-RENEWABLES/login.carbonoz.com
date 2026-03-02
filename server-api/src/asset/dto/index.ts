import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EFuelType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class RegisterUserAssetsDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'BBox',
  })
  assetName: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'Carbonoz',
  })
  assetOwner: string;

  @IsNotEmpty()
  @IsEnum(EFuelType)
  @ApiProperty({ required: true, enum: EFuelType })
  fuelType: EFuelType;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'Rwanda',
  })
  country: string;

  @IsNumber()
  @IsNotEmpty()
  @ApiProperty({
    type: Number,
    required: true,
    default: -1.2921,
  })
  latitude: number;

  @IsNumber()
  @IsNotEmpty()
  @ApiProperty({
    type: Number,
    required: true,
    default: 36.8219,
  })
  longitude: number;

  @IsNumber()
  @IsNotEmpty()
  @ApiProperty({
    type: Number,
    required: true,
    default: 24.0,
  })
  capacityKwp: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'Service',
  })
  service: string;

  @IsDateString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: '2024-01-01T00:00:00Z',
  })
  codDate: Date;

  @IsInt()
  @IsNotEmpty()
  @ApiProperty({
    type: Number,
    required: true,
    default: 10,
  })
  amountOfInverters: number;

  @IsInt()
  @IsNotEmpty()
  @ApiProperty({
    type: Number,
    required: true,
    default: 20,
  })
  amountOfPanels: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'BrandX',
  })
  panelBrand: string;

  @IsInt()
  @IsNotEmpty()
  @ApiProperty({
    type: Number,
    required: true,
    default: 300,
  })
  panelPower: number;

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
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'ModelX',
  })
  inverterModel: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'MonitoringSystemX',
  })
  monitoringSystemName: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'http://example.com',
  })
  monitoringSystemURL: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'path/to/building/photo',
  })
  buildingPhotoUpload: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'path/to/inverter/setup/photo',
  })
  inverterSetupPhotoUpload: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'path/to/solar/panels/photo',
  })
  solarPanelsPhotoUpload: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'SolarTx',
  })
  inverterBrand: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'SerialNumber1',
  })
  BatterySerialNumber1: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'SerialNumber2',
  })
  BatterySerialNumber2: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'SerialNumber3',
  })
  BatterySerialNumber3: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'SerialNumber1',
  })
  InverterSerialnumber1: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'SerialNumber2',
  })
  InverterSerialnumber2: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'SerialNumber3',
  })
  InverterSerialnumber3: string;
}
