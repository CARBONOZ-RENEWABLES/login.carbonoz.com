import { ApiProperty } from '@nestjs/swagger';
import { ESystemSteps } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class RegisterSystemStep {
  @IsNotEmpty()
  @IsEnum(ESystemSteps)
  @ApiProperty({ required: true, enum: ESystemSteps })
  step: ESystemSteps;
}
