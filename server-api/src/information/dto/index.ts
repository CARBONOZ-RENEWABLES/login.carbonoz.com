import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RegisterUserInfoDto {
  @ApiProperty({ type: String, default: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ type: String, default: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ type: String, default: '123 Main St' })
  @IsString()
  street: string;

  @ApiProperty({ type: String, default: 'Kigali' })
  @IsString()
  city: string;

  @ApiProperty({ type: String, default: '+250781273704' })
  @IsString()
  telephone: string;

  @ApiProperty({ type: String, default: 'English' })
  @IsString()
  customerLanguage: string;

  @ApiProperty({ type: String, default: 'Africa/Kigali' })
  @IsString()
  customerTimezone: string;
}
