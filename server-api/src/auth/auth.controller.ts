import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  authenticateDTO,
  CreateUserDto,
  forgotPasswordDto,
  LoginUserDto,
  VerifyUserDto,
} from './dto';

@Controller('auth')
@ApiTags('auth')
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiCreatedResponse({ description: 'User created successfully' })
  @ApiOperation({ summary: 'user registration' })
  @ApiConflictResponse({ description: 'User already exists' })
  @ApiBody({ type: CreateUserDto })
  @Post('sign-up')
  async userSignUp(@Body() dto: CreateUserDto) {
    return await this.authService.createUser(dto);
  }

  @ApiOkResponse({ description: 'User logged in successfully' })
  @ApiForbiddenResponse({ description: 'Forbidden User' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiOperation({ summary: 'user login' })
  @ApiBody({ type: LoginUserDto })
  @HttpCode(200)
  @Post('login')
  async userLogin(@Body() dto: LoginUserDto) {
    const result = await this.authService.loginUser(dto);
    return result;
  }

  @ApiOkResponse({ description: 'Verify User' })
  @ApiBadRequestResponse({ description: 'Invalid or expired token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiOperation({ summary: 'User verification' })
  @ApiBody({ type: VerifyUserDto })
  @HttpCode(200)
  @Post('verify-user')
  async verifyUser(@Body() dto: VerifyUserDto) {
    const result = await this.authService.verifyUser(dto);
    return result;
  }

  @ApiOkResponse({ description: 'Email sent for  User' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiOperation({ summary: 'User forgot password' })
  @ApiBody({ type: forgotPasswordDto })
  @HttpCode(200)
  @Post('forgot-password')
  async verifyUserForResetingPassword(@Body() dto: forgotPasswordDto) {
    const result = await this.authService.EmailForgotPassword(dto);
    return result;
  }

  @ApiOkResponse({ description: 'Verify User ' })
  @ApiBadRequestResponse({ description: 'Invalid or expired token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiOperation({ summary: 'User verification while reseting password' })
  @ApiBody({ type: VerifyUserDto })
  @HttpCode(200)
  @Post('verify-user-email')
  async verifyUserOnReset(@Body() dto: VerifyUserDto) {
    const result = await this.authService.verifyUserOnReset(dto);
    return result;
  }

  @ApiOkResponse({ description: 'User authenticated  successfully' })
  @ApiOperation({ summary: 'authenticate login' })
  @ApiBody({ type: authenticateDTO })
  @HttpCode(200)
  @Post('authenticate')
  async AuthenticateUser(@Body() dto: authenticateDTO) {
    const result = await this.authService.authenticateUser(dto);
    return result;
  }

  @ApiExcludeEndpoint()
  @ApiOkResponse({ description: 'get hosts' })
  @ApiOperation({ summary: 'Get all hosts' })
  @HttpCode(200)
  @Get('hosts')
  async GetHosts() {
    const result = await this.authService.getUserServers();
    return result;
  }
}
