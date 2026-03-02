import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class EditUserInfoDto {
  @ApiPropertyOptional({ type: String, default: 'John' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ type: String, default: 'Doe' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ type: String, default: '123 Main St' })
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional({ type: String, default: 'Kigali' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ type: String, default: '+250781273704' })
  @IsOptional()
  @IsString()
  telephone?: string;

  @ApiPropertyOptional({ type: String, default: 'English' })
  @IsOptional()
  @IsString()
  customerLanguage?: string;

  @ApiPropertyOptional({ type: String, default: 'Africa/Kigali' })
  @IsOptional()
  @IsString()
  customerTimezone?: string;
}
