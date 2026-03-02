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
  ApiCreatedResponse,
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
import { BoxService } from './box.service';
import { RegisterBoxDto } from './dto';

@Controller('box')
@ApiTags('box')
@UseGuards(JwtGuard, RolesGuard)
@AllowRoles(ERole.USER)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
export class BoxController {
  constructor(private readonly boxService: BoxService) {}

  @ApiCreatedResponse({ description: 'box registerd successfully' })
  @ApiBody({ type: RegisterBoxDto })
  @ApiOperation({ summary: 'user register box' })
  @Post('register')
  async topic(@Body() dto: RegisterBoxDto, @GetUser() user: User) {
    const result = await this.boxService.registerBox(dto, user);
    return result;
  }
  @ApiOkResponse({ description: 'boxes retrieved successfully' })
  @HttpCode(200)
  @ApiOperation({ summary: 'user retrieve boxes' })
  @Get('retrieve')
  async topics(@GetUser() user: User) {
    const result = await this.boxService.getBoxesRegistered(user);
    return new GenericResponse('boxes', result);
  }
}
