import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiRequestTimeoutResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ERole } from '@prisma/client';
import { GenericResponse } from 'src/__shared__/dto';
import { IPagination } from 'src/__shared__/interfaces/pagination-interface';
import {
  AllowRoles,
  PageResponse,
  Paginated,
  PaginationParams,
} from 'src/auth/decorators';
import { JwtGuard } from 'src/auth/guard/jwt.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { RedexService } from 'src/redex/redex.service';
import { AdminService } from './admin.service';
import {
  AdminSignUserDto,
  DeactivateUsersDto,
  FilterRedexInfoDto,
  FilterUsers,
} from './dto';

@Controller('admin')
@ApiTags('admin')
@UseGuards(JwtGuard, RolesGuard)
@AllowRoles(ERole.ADMIN)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
@ApiRequestTimeoutResponse({ description: 'Internet Error' })
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly redexService: RedexService,
  ) {}

  @ApiOkResponse({
    description: 'users retrieved successfully',
  })
  @HttpCode(200)
  @PageResponse()
  @Paginated()
  @ApiOperation({ summary: 'admin fetch all users' })
  @Get('users')
  async getAllUsers(
    @PaginationParams() options: IPagination,
    @Query() dto: FilterUsers,
  ) {
    const result = await this.adminService.getUsers(options, dto);
    return new GenericResponse('users', result);
  }

  @ApiCreatedResponse({ description: 'Admin  created User successfully' })
  @ApiOperation({ summary: 'Admin do user registration' })
  @ApiConflictResponse({ description: 'User already exists' })
  @ApiBody({ type: AdminSignUserDto })
  @Post('sign-users')
  async addUser(@Body() dto: AdminSignUserDto) {
    const result = await this.adminService.signUsersUp(dto);
    return new GenericResponse('Admin', result);
  }

  @ApiOkResponse({
    description: 'Admin  activated or deactivated User successfully',
  })
  @ApiOperation({ summary: 'Admin activate or deactivate users' })
  @ApiBody({ type: DeactivateUsersDto })
  @HttpCode(200)
  @Patch('toogle-activation')
  async toogleActivation(@Body() dto: DeactivateUsersDto) {
    const result = await this.adminService.toogleUsersActivation(dto);
    return new GenericResponse('', result);
  }

  @ApiOkResponse({
    description: 'logs retrieved successfully',
  })
  @HttpCode(200)
  @PageResponse()
  @Paginated()
  @ApiOperation({ summary: 'admin fetch logs' })
  @Get('logs')
  async getLogs(@PaginationParams() options: IPagination) {
    const result = await this.adminService.getLogs(options);
    return new GenericResponse('logs', result);
  }
  @ApiOkResponse({
    description: 'logs retrieved successfully',
  })
  @HttpCode(200)
  @PageResponse()
  @Paginated()
  @ApiOperation({ summary: 'admin fetch redex Info' })
  @Get('redex-info')
  async getRedexInfo(
    @PaginationParams() options: IPagination,
    @Query() dto: FilterRedexInfoDto,
  ) {
    const result = await this.adminService.getRedexFiles(options, dto);
    return new GenericResponse('redex', result);
  }

  @ApiCreatedResponse({ description: 'Admin Sent Redex data  successfully' })
  @ApiOperation({ summary: 'Admin Send Redex data ' })
  @ApiBadRequestResponse({ description: 'No data to be sent to redex' })
  @Post('send-to-redex')
  async sentToRedex() {
    await this.redexService.sendRegisteredDeviceToRedex();
    return new GenericResponse('redex data sent succesfully', null);
  }
}
