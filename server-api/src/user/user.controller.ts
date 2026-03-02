import {
  Body,
  Controller,
  Get,
  HttpCode,
  ParseFilePipeBuilder,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiRequestTimeoutResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ERole, User } from '@prisma/client';
import { GenericResponse } from 'src/__shared__/dto';
import { AssetService } from 'src/asset/asset.service';
import { RegisterUserAssetsDto } from 'src/asset/dto';
import { AllowRoles, GetUser } from 'src/auth/decorators';
import { JwtGuard } from 'src/auth/guard/jwt.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { BoxService } from 'src/box/box.service';
import { CertificationService } from 'src/certification/certification.service';
import { CertificationDto } from 'src/certification/dto';
import { RegisterUserInfoDto } from 'src/information/dto';
import { InformationService } from 'src/information/information.service';
import { MeterDto } from 'src/meter/dto';
import { MeterService } from 'src/meter/meter.service';
import { ProjectDto } from 'src/project/dto';
import { ProjectService } from 'src/project/project.service';
import { RedexService } from 'src/redex/redex.service';
import { resetPasswordDto } from './dto';
import { EditUserInfoDto } from './dto/editUserInfo.dto';
import { UserService } from './user.service';

@Controller('user')
@ApiTags('user')
@UseGuards(JwtGuard, RolesGuard)
@AllowRoles(ERole.USER)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
@ApiRequestTimeoutResponse({ description: 'Internet Error' })
export class UserController {
  constructor(
    private readonly assetService: AssetService,
    private readonly additionalInfo: InformationService,
    private readonly redexService: RedexService,
    private readonly boxService: BoxService,
    private readonly meterService: MeterService,
    private readonly projectService: ProjectService,
    private readonly certificationService: CertificationService,
    private readonly userService: UserService,
  ) {}

  @ApiOkResponse({
    description: 'user additional assets retrieved successfully',
    type: GenericResponse,
  })
  @HttpCode(200)
  @ApiOperation({ summary: 'user assets' })
  @Get('assets')
  async getAssets(@GetUser() user: User) {
    const result = await this.assetService.getAllAssets(user);
    return new GenericResponse('user-assets', result);
  }

  @ApiCreatedResponse({
    description: 'user created additional assets',
    type: GenericResponse,
  })
  @Post('asset')
  @ApiBody({ type: RegisterUserAssetsDto })
  @ApiOperation({ summary: 'user create asset' })
  async createAsset(@Body() dto: RegisterUserAssetsDto, @GetUser() user: User) {
    const result = await this.assetService.registerAssets(dto, user);
    return new GenericResponse('created-asset', result);
  }

  @ApiOkResponse({
    description: 'user additional infos retrieved successfully',
    type: GenericResponse,
  })
  @HttpCode(200)
  @ApiOperation({ summary: 'user aditional information' })
  @Get('infos')
  async getAdditionalInformation(@GetUser() user: User) {
    const result = await this.additionalInfo.getAdditionalInformation(user);
    return new GenericResponse('user-infos', result);
  }

  @Post('info')
  @ApiCreatedResponse({
    description: 'user created additional infos',
    type: GenericResponse,
  })
  @ApiBody({ type: RegisterUserInfoDto })
  @ApiOperation({ summary: 'user create additional info' })
  @ApiConflictResponse({
    description: 'Information  already exists for this user',
  })
  async createAdditionalInfo(
    @Body() dto: RegisterUserInfoDto,
    @GetUser() user: User,
  ) {
    const result = await this.additionalInfo.createAdditionalInformation(
      dto,
      user,
    );
    return new GenericResponse('created-info', result);
  }

  @ApiCreatedResponse({
    description: 'user created meter infos',
    type: GenericResponse,
  })
  @ApiBody({ type: MeterDto })
  @ApiOperation({ summary: 'user create meter info' })
  @ApiConflictResponse({
    description: 'meter  already exists for this user',
  })
  @Post('meter')
  async addMeter(@Body() dto: MeterDto, @GetUser() user: User) {
    const result = await this.meterService.addMeter(dto, user);
    return new GenericResponse('meter-info', result);
  }

  @ApiOkResponse({
    description: 'user meter infos retrieved successfully',
    type: GenericResponse,
  })
  @HttpCode(200)
  @ApiOperation({ summary: 'user meter information' })
  @Get('meter')
  async getMeter(@GetUser() user: User) {
    const result = await this.meterService.getMeter(user);
    return new GenericResponse('get-meter-infos', result);
  }

  @ApiCreatedResponse({
    description: 'user created project infos',
    type: GenericResponse,
  })
  @ApiBody({ type: ProjectDto })
  @ApiOperation({ summary: 'user create project info' })
  @ApiConflictResponse({
    description: 'project  already exists for this user',
  })
  @Post('project')
  async addProject(@Body() dto: ProjectDto, @GetUser() user: User) {
    const result = await this.projectService.addProject(dto, user);
    return new GenericResponse('project-info', result);
  }

  @ApiOkResponse({
    description: 'user project infos retrieved successfully',
    type: GenericResponse,
  })
  @HttpCode(200)
  @ApiOperation({ summary: 'user project information' })
  @Get('project')
  async getProject(@GetUser() user: User) {
    const result = await this.projectService.getProject(user);
    return new GenericResponse('get-project-infos', result);
  }

  @ApiCreatedResponse({
    description: 'user created certification infos',
    type: GenericResponse,
  })
  @ApiBody({ type: ProjectDto })
  @ApiOperation({ summary: 'user create certification info' })
  @ApiConflictResponse({
    description: 'certification  already exists for this user',
  })
  @Post('certification')
  async addCertification(@Body() dto: CertificationDto, @GetUser() user: User) {
    const result = await this.certificationService.addCertificates(dto, user);
    return new GenericResponse('certification-info', result);
  }

  @ApiOkResponse({
    description: 'user certification infos retrieved successfully',
    type: GenericResponse,
  })
  @HttpCode(200)
  @ApiOperation({ summary: 'user certification information' })
  @Get('certification')
  async getCertification(@GetUser() user: User) {
    const result = await this.certificationService.getCertificates(user);
    return new GenericResponse('get-certification-infos', result);
  }

  @ApiBody({
    description: 'File to upload',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload file and send it to redex',
  })
  @ApiCreatedResponse({ description: 'File uploaded' })
  @UseInterceptors(FileInterceptor('file'))
  @Post('redex-file')
  async uploadFile(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: new RegExp('^.*.(pdf)$', 'i'),
        })
        .addMaxSizeValidator({
          maxSize: 10 * 1024 * 1024,
        })
        .build({
          errorHttpStatusCode: 400,
        }),
    )
    file: Express.Multer.File,
    @GetUser() user: User,
  ) {
    const result = await this.redexService.uplaodFile(file, user);
    return new GenericResponse('File uplaoded', result);
  }

  @ApiOkResponse({
    description: 'user Ports retrieved successfully',
    type: GenericResponse,
  })
  @HttpCode(200)
  @ApiOperation({ summary: 'user ports' })
  @Get('ports')
  async getUserPorts(@GetUser() user: User) {
    const result = await this.boxService.getUserPorts(user);
    return new GenericResponse('user-ports', result);
  }

  @ApiOkResponse({
    description: 'redex file  Id retrieved successfully',
    type: GenericResponse,
  })
  @HttpCode(200)
  @ApiOperation({ summary: 'redex file  Id' })
  @Get('redex')
  async getRedexFile(@GetUser() user: User) {
    const result = await this.redexService.getUserFileId(user);
    return new GenericResponse('redex file Id', result);
  }

  @Patch('reset-password')
  @ApiBody({ type: resetPasswordDto })
  @ApiCreatedResponse({ description: 'Password reseted' })
  @ApiOperation({ summary: 'Reset user password' })
  async resetPassword(@Body() dto: resetPasswordDto, @GetUser() user: User) {
    const result = await this.userService.resetPassword(dto, user);
    return new GenericResponse('Password reseted', result);
  }

  // @ApiCreatedResponse({
  //   description: 'Email sent successfully',
  // })
  // @Post('email')
  // async sendTEmail() {
  //   const result = await this.userService.sendTestEmail();
  //   return new GenericResponse('Email sent', result);
  // }

  @Patch('edit-user')
  @ApiBody({ type: EditUserInfoDto })
  @ApiOkResponse({ description: 'User info edited succesfully' })
  @HttpCode(200)
  @ApiOperation({ summary: 'Edit user info' })
  async editUserInfo(@Body() dto: EditUserInfoDto, @GetUser() user: User) {
    const result = await this.userService.editUserInformation(dto, user);
    return new GenericResponse('info edited succesfully', result);
  }

  @ApiOkResponse({ description: ' credentials retreived' })
  @ApiOperation({ summary: 'User get  credentials' })
  @Get('credentials')
  async GenerateCredentials(@GetUser() user: User) {
    const result = await this.userService.generateCredentials(user);
    return new GenericResponse('credentials retreived', result);
  }
}
