import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
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
import { RegisterPartnerDto } from './dto';
import { PartnersService } from './partners.service';

@Controller('partners')
@ApiTags('partners')
@UseGuards(JwtGuard, RolesGuard)
@AllowRoles(ERole.USER)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}
  @ApiCreatedResponse({ description: 'partner registerd successfully' })
  @ApiBody({ type: RegisterPartnerDto })
  @ApiOperation({ summary: 'register partner' })
  @Post('')
  async register(@Body() dto: RegisterPartnerDto, @GetUser() user: User) {
    const result = await this.partnersService.registerPartner(dto, user);
    return new GenericResponse('registered partners', result);
  }
  @ApiCreatedResponse({ description: 'partners update successfully' })
  @ApiBody({ type: RegisterPartnerDto })
  @ApiOperation({ summary: 'update partners' })
  @Patch('')
  async update(@Body() dto: RegisterPartnerDto, @GetUser() user: User) {
    const result = await this.partnersService.updateExistingPartners(dto, user);
    return new GenericResponse('updated partners', result);
  }

  @ApiOkResponse({ description: 'partners retreived' })
  @ApiOperation({ summary: 'retrieve partners' })
  @Get('')
  async getPartners(@GetUser() user: User) {
    const result = await this.partnersService.getPartners(user);
    return new GenericResponse('retrieve partners', result);
  }
}
