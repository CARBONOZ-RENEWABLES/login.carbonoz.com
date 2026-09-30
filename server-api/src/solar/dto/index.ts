import { ApiPropertyOptional } from '@nestjs/swagger';
import { ESolarDeviceKind } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class DeviceKindQueryDto {
  @ApiPropertyOptional({ enum: ESolarDeviceKind })
  @IsOptional()
  @IsEnum(ESolarDeviceKind)
  kind?: ESolarDeviceKind;
}

export class CellsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bmsId?: string;
}

export class HistoryQueryDto {
  @ApiPropertyOptional({ example: 'pv_power_w' })
  @Matches(/^[a-z0-9_]{1,100}$/)
  metric: string;

  @ApiPropertyOptional({ enum: ESolarDeviceKind, default: 'SYSTEM' })
  @IsOptional()
  @IsEnum(ESolarDeviceKind)
  kind?: ESolarDeviceKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(86400 * 31)
  bucketSeconds?: number;
}

export class EventsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  before?: Date;
}

export class EnergyHistoryQueryDto {
  @ApiPropertyOptional({ enum: ['30d', '1y', '10y'], default: '30d' })
  @IsOptional()
  @IsIn(['30d', '1y', '10y'])
  range?: '30d' | '1y' | '10y';

  @ApiPropertyOptional({
    description:
      'Last bucket of the range: YYYY-MM-DD (30d), YYYY-MM (1y) or YYYY (10y). Default: now.',
  })
  @IsOptional()
  @Matches(/^\d{4}(-\d{2}(-\d{2})?)?$/)
  anchor?: string;
}
