import { Controller, Get, HttpCode, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { SubscriptionGuard } from 'src/subscription/guards/subscription.guard';
import { CarbonIntensityQueryDTO } from './dto';
import { CarbonIntensityService } from './carbon-intensity.service';

@Controller('carbon-intensity')
@ApiTags('carbon-intensity')
@UseGuards(JwtGuard, RolesGuard, SubscriptionGuard)
@AllowRoles(ERole.USER)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
export class CarbonIntensityController {
  constructor(private readonly carbonIntensityService: CarbonIntensityService) {}

  @ApiOkResponse({ description: 'Carbon intensity data for last 7 days retrieved successfully' })
  @HttpCode(200)
  @ApiOperation({ summary: 'Get carbon intensity data for last 7 days' })
  @Get('7')
  async getCarbonIntensityFor7Days(
    @GetUser() user: User,
    @Query() dto: CarbonIntensityQueryDTO,
  ) {
    const result = await this.carbonIntensityService.getCarbonIntensityData(user, dto, 7);
    return new GenericResponse('Carbon intensity data for 7 days', result);
  }

  @ApiOkResponse({ description: 'Carbon intensity data for last 30 days retrieved successfully' })
  @HttpCode(200)
  @ApiOperation({ summary: 'Get carbon intensity data for last 30 days' })
  @Get('30')
  async getCarbonIntensityFor30Days(
    @GetUser() user: User,
    @Query() dto: CarbonIntensityQueryDTO,
  ) {
    const result = await this.carbonIntensityService.getCarbonIntensityData(user, dto, 30);
    return new GenericResponse('Carbon intensity data for 30 days', result);
  }

  @ApiOkResponse({ description: 'Carbon intensity data for last 12 months retrieved successfully' })
  @HttpCode(200)
  @ApiOperation({ summary: 'Get carbon intensity data for last 12 months' })
  @Get('12')
  async getCarbonIntensityFor12Months(
    @GetUser() user: User,
    @Query() dto: CarbonIntensityQueryDTO,
  ) {
    const result = await this.carbonIntensityService.getCarbonIntensityData(user, dto, 365);
    return new GenericResponse('Carbon intensity data for 12 months', result);
  }
}
