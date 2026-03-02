import { ApiProperty } from '@nestjs/swagger';
import { ESteps } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class RegisterStep {
  @IsNotEmpty()
  @IsEnum(ESteps)
  @ApiProperty({ required: true, enum: ESteps })
  step: ESteps;
}
