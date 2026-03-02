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
import { RegisterSystemStep } from './dto';
import { SystemstepsService } from './systemsteps.service';

@Controller('systemsteps')
@ApiTags('systemsteps')
@UseGuards(JwtGuard, RolesGuard)
@AllowRoles(ERole.USER)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
export class SystemstepsController {
  constructor(private readonly systemStepsService: SystemstepsService) {}

  @ApiOkResponse({
    description: 'user steps created successfully',
  })
  @ApiOperation({ summary: 'user system steps' })
  @ApiBody({ type: RegisterSystemStep })
  @Post('step')
  async RegisterSteps(@Body() dto: RegisterSystemStep, @GetUser() user: User) {
    const result = await this.systemStepsService.registerStep(dto, user);
    return new GenericResponse('step registered', result);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'get user system steps' })
  @ApiOkResponse({
    description: 'user steps retrieved successfully',
  })
  @Get('step')
  async getSteps(@GetUser() user: User) {
    const result = await this.systemStepsService.getUserStep(user);
    return new GenericResponse('step retrieved', result);
  }
}
