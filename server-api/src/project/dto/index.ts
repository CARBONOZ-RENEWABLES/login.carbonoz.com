import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ProjectDto {
  @ApiPropertyOptional({
    type: String,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsString()
  projectBackground?: string;

  @ApiPropertyOptional({
    type: String,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsString()
  projectDescription?: string;

  @ApiPropertyOptional({
    type: String,
    required: false,
    default: null,
  })
  @IsOptional()
  @IsString()
  projectImpact?: string;
}
