import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ECustomerRole,
  ECustomerType,
  EInstallationKind,
  EMachineCredentialType,
} from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsIanaTimeZone } from 'src/__shared__/utils/timezone';

export class CreateCustomerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ enum: ECustomerType })
  @IsOptional()
  @IsEnum(ECustomerType)
  type?: ECustomerType;

  @ApiPropertyOptional({
    description: 'Existing Carbonoz user to add as OWNER',
  })
  @IsOptional()
  @IsMongoId()
  ownerUserId?: string;
}

export class AddCustomerMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: ECustomerRole })
  @IsOptional()
  @IsEnum(ECustomerRole)
  role?: ECustomerRole;
}

export class CreateSiteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiProperty({
    example: 'Europe/Berlin',
    description:
      'IANA time zone of the installation: sets the calendar days, months and years of its energy history.',
  })
  @IsIanaTimeZone()
  timezone: string;
}

/** Time zone and location (weather and solar forecast) are editable after creation. */
export class UpdateSiteDto {
  @ApiPropertyOptional({ example: 'Africa/Kigali' })
  @IsOptional()
  @IsIanaTimeZone()
  timezone?: string;

  @ApiPropertyOptional({ example: -20.16, description: 'null clears it' })
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({ example: 57.5, description: 'null clears it' })
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}

export class CreateInstallationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ enum: EInstallationKind })
  @IsOptional()
  @IsEnum(EInstallationKind)
  kind?: EInstallationKind;

  @ApiPropertyOptional({ description: 'systemId the SolarBMS device reports' })
  @IsOptional()
  @IsString()
  externalSystemId?: string;
}

export class CreateMachineCredentialDto {
  @ApiProperty({ enum: EMachineCredentialType })
  @IsEnum(EMachineCredentialType)
  type: EMachineCredentialType;

  @ApiPropertyOptional({
    description: 'Keycloak client id (required for KEYCLOAK_CLIENT)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: ECustomerType })
  @IsOptional()
  @IsEnum(ECustomerType)
  type?: ECustomerType;
}

export class UpdateInstallationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'systemId the SolarBMS device reports; empty string clears it',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalSystemId?: string;

  @ApiPropertyOptional({
    description:
      'false blocks ingestion for every credential of this installation',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
