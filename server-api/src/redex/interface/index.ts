import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export interface RedexAuthResponse {
  Data: {
    AccessToken: string;
    RefreshToken: string;
    ExpiresIn: string;
    TokenType: string;
    Scope: string;
  };
  Errors: null | Array<{
    Key: string;
    Message: string;
  }>;
  StatusCode: number;
  Message: string;
  Meta: null;
}

export interface RedexFileUplaodResponse {
  Errors: [];
  Meta: null;
  StatusCode: number;
  Data: {
    Id: string;
    ValidationCode: string;
  } | null;
  Message: string;
}

export interface RedexRegDeviceResponse {
  StatusCode: number;
  Errors: [];
  Meta: null;
  Data: {
    Id: string;
  };
  Message: string;
}

export interface RedexgenerateMonthlydataResponse {
  StatusCode: number;
  Errors: null;
  Meta: null;
  Data: {
    ProcessId: number;
  };
  Message: string;
}

export interface Redex422ErrorResponse {
  StatusCode: number;
  Errors: [
    {
      Key: string;
      Message: string;
      Messages: Array<string>;
    },
  ];
  Meta: null;
  Data: null;
  Message: string;
}

export interface Redex400ErrorResponse {
  StatusCode: number;
  Errors: null;
  Meta: null;
  Data: null;
  Message: string;
}

class InverterDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    type: String,
    required: true,
    example: 'RM1000020003386274014',
  })
  RemoteInvId: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ type: String, required: true, example: 'HW2343243244414' })
  ElectronicSerialNumber: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ type: String, required: true, example: 'HW21' })
  BrandCode: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ type: String, required: false, example: '' })
  OtherBrandName?: string;

  @IsNotEmpty()
  @IsNumber()
  @ApiProperty({ type: Number, required: true, example: 10.9 })
  InstalledCapacity: number;
}

class DeviceDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    type: String,
    required: true,
    example: 'ChinaSolarDeveloper-AnhuiSheng-000001',
  })
  InstallationName: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    type: String,
    required: true,
    example: 'Anhui Sheng Parade Jago Cl62 Jago Cl',
  })
  Address: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ type: String, required: true, example: '431231' })
  PostalCode: string;

  @IsNotEmpty()
  @IsNumber()
  @ApiProperty({ type: Number, required: true, example: 103.90861 })
  Longitude: number;

  @IsNotEmpty()
  @IsNumber()
  @ApiProperty({ type: Number, required: true, example: 1.305278 })
  Latitude: number;

  @IsNotEmpty()
  @IsDateString()
  @ApiProperty({
    type: String,
    format: 'date',
    required: true,
    example: '2022-05-13',
  })
  GridConnectionDate: string;

  @IsNotEmpty()
  @IsDateString()
  @ApiProperty({
    type: String,
    format: 'date',
    required: true,
    example: '2022-05-13',
  })
  OwnersDeclarationStartDate: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    required: false,
    example: '2025-05-13',
  })
  OwnersDeclarationEndDate: string;

  @IsNotEmpty()
  @IsBoolean()
  @ApiProperty({ type: Boolean, required: true, example: true })
  Domestic: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ type: Boolean, required: false, example: false })
  FeedInTariff: boolean;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    type: String,
    required: true,
    example: '94584c27-518d-45b5-1d2b-08dc6a99c86e',
  })
  DeclarationFormFileId: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ type: Number, required: false, example: 100 })
  PercentageRenewable: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InverterDto)
  @ApiProperty({ type: [InverterDto], required: true })
  Inverters: InverterDto[];
}

export class RedexRegisterDeviceDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ type: String, required: true, example: 'CN' })
  CountryCode: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    type: String,
    required: true,
    example: 'SEASolar-Singapore-20240516001',
  })
  GroupedEnglishName: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    type: String,
    required: true,
    example: '海电能源-新加坡-20240516001',
  })
  GroupedLocalName: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ type: String, required: true, example: 'CN-AH' })
  Province: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ type: String, required: false, example: 'UTC+08:00' })
  Timezone: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ type: String, required: false, example: 'Daily' })
  GenerationDataFrequency: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeviceDto)
  @ApiProperty({ type: [DeviceDto], required: true })
  Devices: DeviceDto[];
}
