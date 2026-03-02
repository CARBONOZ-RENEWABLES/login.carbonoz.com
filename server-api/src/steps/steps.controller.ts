import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ERole, User } from '@prisma/client';
import { GenericResponse } from 'src/__shared__/dto';
import { AllowRoles, GetUser } from 'src/auth/decorators';
import { JwtGuard } from 'src/auth/guard/jwt.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { RegisterStep } from './dto';
import { StepsService } from './steps.service';

@Controller('steps')
@ApiTags('steps')
@UseGuards(JwtGuard, RolesGuard)
@AllowRoles(ERole.USER)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
export class StepsController {
  constructor(private readonly stepsService: StepsService) {}

  @ApiOkResponse({
    description: 'user steps created successfully',
  })
  @ApiOperation({ summary: 'user steps' })
  @ApiBody({ type: RegisterStep })
  @Post('step')
  async RegisterSteps(@Body() dto: RegisterStep, @GetUser() user: User) {
    const result = await this.stepsService.registerStep(dto, user);
    return new GenericResponse('step registered', result);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'get user steps' })
  @ApiOkResponse({
    description: 'user steps retrieved successfully',
  })
  @Get('step')
  async getSteps(@GetUser() user: User) {
    const result = await this.stepsService.getUserStep(user);
    return new GenericResponse('step retrieved', result);
  }

  @ApiOkResponse({
    description: 'user skipped step  successfully',
  })
  @ApiOperation({ summary: 'user skip steps' })
  @ApiBody({ type: RegisterStep })
  @Post('skip-step')
  async skipSteps(@Body() dto: RegisterStep, @GetUser() user: User) {
    const result = await this.stepsService.skipStep(dto, user);
    return new GenericResponse('step skipped', result);
  }
}
