import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Onboarding asks only for name, language and time zone; address and phone are optional. */

export class RegisterUserInfoDto {
  @ApiProperty({ type: String, default: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ type: String, default: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

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

  @ApiProperty({ type: String, default: 'English' })
  @IsString()
  @IsNotEmpty()
  customerLanguage: string;

  @ApiProperty({ type: String, default: 'Africa/Kigali' })
  @IsString()
  @IsNotEmpty()
  customerTimezone: string;
}
