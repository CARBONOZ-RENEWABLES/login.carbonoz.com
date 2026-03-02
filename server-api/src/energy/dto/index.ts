import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class FilterTimeEnergyDTO {
  @IsOptional()
  @ApiPropertyOptional({ type: String, default: '12/01/2018' })
  from: string;
  @IsOptional()
  @ApiPropertyOptional({
    type: String,
    default: '12/01/2020',
  })
  to: string;
  @IsOptional()
  @ApiPropertyOptional({
    type: String,
    default: 'Indian/Mauritius',
  })
  timezone: string;
}

export class FilterEnergyForLastMonthsDTO extends OmitType(
  FilterTimeEnergyDTO,
  ['from', 'to'] as const,
) {}
