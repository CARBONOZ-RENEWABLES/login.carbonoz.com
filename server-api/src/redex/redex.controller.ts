import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ERole, User } from '@prisma/client';
import { GenericResponse } from 'src/__shared__/dto';
import { AllowRoles, GetUser } from 'src/auth/decorators';
import { JwtGuard } from 'src/auth/guard/jwt.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { RedexRegisterDeviceDto } from './interface';
import { RedexService } from './redex.service';

@Controller('redex')
@ApiTags('redex')
@UseGuards(JwtGuard, RolesGuard)
@AllowRoles(ERole.USER)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
export class RedexController {
  constructor(private readonly redexService: RedexService) {}

  @ApiCreatedResponse({ description: 'token retrieved successfully' })
  @ApiOperation({ summary: 'redex token' })
  @Post('token')
  async token() {
    const result = await this.redexService.generateRedexToken();
    return new GenericResponse('redex token', result);
  }

  @ApiCreatedResponse({ description: 'Device registered successfully' })
  @ApiOperation({ summary: 'register Devices' })
  @Post('device')
  @ApiBody({ type: RedexRegisterDeviceDto })
  async registerDevices(
    @Body() dto: RedexRegisterDeviceDto,
    @GetUser() user: User,
  ) {
    const result = await this.redexService.registerGroupDevice(dto, user);
    return new GenericResponse('Device registered', result);
  }

  // @ApiOkResponse({ description: 'reports' })
  // @ApiOperation({ summary: 'monthly report' })
  // @Get('report')
  // async getMonthlyReport() {
  //   const result = await this.redexService.getMonthlyData();
  //   return new GenericResponse('Device report', result);
  // }
}
