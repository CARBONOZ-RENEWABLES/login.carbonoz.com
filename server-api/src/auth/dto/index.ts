import { ApiProperty } from '@nestjs/swagger';
import { ERole } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'christiannseko@gmail.com',
  })
  email: string;
  @IsNotEmpty()
  @IsEnum(ERole)
  @ApiProperty({ required: true, enum: ERole })
  role: ERole;
  @IsNotEmpty()
  @ApiProperty({ type: String, required: true })
  password: string;
}

export class LoginUserDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    type: String,
    required: true,
    default: 'christiannseko@gmail.com',
  })
  email: string;
  @IsNotEmpty()
  @ApiProperty({ type: String, required: true })
  password: string;
}

export class VerifyUserDto {
  @ApiProperty({
    type: String,
    required: true,
    default: 'eTYtffyvytvpppn',
  })
  @IsString()
  token: string;
}

export class forgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'christiannseko@gmail.com',
  })
  email: string;
}
