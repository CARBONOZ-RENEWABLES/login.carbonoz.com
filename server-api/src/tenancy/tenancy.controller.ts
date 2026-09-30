import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { EMachineCredentialType, ERole, Site, User } from '@prisma/client';
import { GenericResponse } from 'src/__shared__/dto';
import { AllowRoles, GetUser } from 'src/auth/decorators';
import { JwtGuard } from 'src/auth/guard/jwt.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import {
  MachineAuthService,
  sha256,
} from 'src/machine-auth/machine-auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  AddCustomerMemberDto,
  CreateCustomerDto,
  CreateInstallationDto,
  CreateMachineCredentialDto,
  CreateSiteDto,
} from './dto';
import { CurrentSite, SiteAccessGuard } from './site-access.guard';
import { isObjectId, TenancyService } from './tenancy.service';
import { findUserByEmail } from 'src/__shared__/utils/email';

@Controller()
@ApiTags('sites')
@UseGuards(JwtGuard, RolesGuard)
@AllowRoles(ERole.USER, ERole.ADMIN)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class SitesController {
  constructor(private readonly tenancy: TenancyService) {}

  @ApiOkResponse({ description: 'Customers the signed-in user belongs to' })
  @Get('customers/me')
  async myCustomers(@GetUser() user: User) {
    const rows = await this.tenancy.membershipsFor(user);
    return new GenericResponse(
      'customers',
      rows.map((m) => ({ ...m.customer, role: m.role })),
    );
  }

  @ApiOkResponse({ description: 'Sites the signed-in user may access' })
  @Get('sites')
  async sites(@GetUser() user: User) {
    return new GenericResponse('sites', await this.tenancy.sitesFor(user));
  }

  @UseGuards(SiteAccessGuard)
  @Get('sites/:siteId')
  async site(@CurrentSite() site: Site) {
    return new GenericResponse('site', site);
  }
}

/** Provisioning: customers, members, sites, installations and device credentials. */
@Controller('admin')
@ApiTags('admin')
@UseGuards(JwtGuard, RolesGuard)
@AllowRoles(ERole.ADMIN)
@ApiBearerAuth()
export class AdminTenancyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancy: TenancyService,
    private readonly machines: MachineAuthService,
  ) {}

  private id(v: string, what: string) {
    if (!isObjectId(v)) throw new NotFoundException(`${what} not found`);
    return v;
  }

  @Get('customers')
  async customers() {
    const data = await this.prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        members: { include: { user: { select: { id: true, email: true } } } },
        sites: { select: { id: true, name: true } },
      },
    });
    return new GenericResponse('customers', data);
  }

  @ApiCreatedResponse({ description: 'Customer created' })
  @Post('customers')
  async createCustomer(@Body() dto: CreateCustomerDto) {
    if (dto.ownerUserId && (dto.type ?? 'INDIVIDUAL') === 'INDIVIDUAL') {
      const c = await this.tenancy.ensurePersonalCustomer(
        dto.ownerUserId,
        dto.name,
      );
      return new GenericResponse('customer', c);
    }
    if (dto.ownerUserId) {
      const u = await this.prisma.user.findUnique({
        where: { id: dto.ownerUserId },
      });
      if (!u) throw new NotFoundException('User not found');
    }
    const data = await this.prisma.customer.create({
      data: {
        name: dto.name,
        type: dto.type ?? 'INDIVIDUAL',
        ...(dto.ownerUserId && {
          members: { create: { userId: dto.ownerUserId, role: 'OWNER' } },
        }),
      },
    });
    return new GenericResponse('customer', data);
  }

  @Post('customers/:customerId/members')
  async addMember(
    @Param('customerId') customerId: string,
    @Body() dto: AddCustomerMemberDto,
  ) {
    this.id(customerId, 'Customer');
    // MongoDB has no foreign keys: check the customer exists before linking to it.
    if (!(await this.prisma.customer.findUnique({ where: { id: customerId } })))
      throw new NotFoundException('Customer not found');
    const user = dto.userId
      ? await this.prisma.user.findUnique({ where: { id: dto.userId } })
      : dto.email
      ? await findUserByEmail(this.prisma, dto.email)
      : null;
    if (!user) throw new NotFoundException('User not found');
    const data = await this.prisma.customerMember.upsert({
      where: { customerId_userId: { customerId, userId: user.id } },
      create: { customerId, userId: user.id, role: dto.role ?? 'VIEWER' },
      update: { role: dto.role ?? undefined },
    });
    return new GenericResponse('member', data);
  }

  @HttpCode(200)
  @Delete('customers/:customerId/members/:userId')
  async removeMember(
    @Param('customerId') customerId: string,
    @Param('userId') userId: string,
  ) {
    this.id(customerId, 'Customer');
    this.id(userId, 'User');
    await this.prisma.customerMember.deleteMany({
      where: { customerId, userId },
    });
    return new GenericResponse('member removed', null);
  }

  @Post('customers/:customerId/sites')
  async createSite(
    @Param('customerId') customerId: string,
    @Body() dto: CreateSiteDto,
  ) {
    this.id(customerId, 'Customer');
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!c) throw new NotFoundException('Customer not found');
    return new GenericResponse(
      'site',
      await this.prisma.site.create({ data: { ...dto, customerId } }),
    );
  }

  @Get('sites/:siteId/installations')
  async installations(@Param('siteId') siteId: string) {
    this.id(siteId, 'Site');
    const data = await this.prisma.installation.findMany({
      where: { siteId },
      include: {
        machineCredentials: {
          // Never return secretHash.
          select: {
            id: true,
            type: true,
            clientId: true,
            active: true,
            label: true,
            createdAt: true,
            lastUsedAt: true,
            revokedAt: true,
          },
        },
      },
    });
    return new GenericResponse('installations', data);
  }

  @Post('sites/:siteId/installations')
  async createInstallation(
    @Param('siteId') siteId: string,
    @Body() dto: CreateInstallationDto,
  ) {
    this.id(siteId, 'Site');
    const s = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!s) throw new NotFoundException('Site not found');
    const data = await this.prisma.installation.create({
      data: {
        siteId,
        name: dto.name,
        kind: dto.kind ?? 'SOLARBMS',
        externalSystemId: dto.externalSystemId,
      },
    });
    return new GenericResponse('installation', data);
  }

  /**
   * One credential per device. For API_KEY the full key is in this response
   * only; Carbonoz keeps just a hash. For KEYCLOAK_CLIENT the secret lives in
   * Keycloak and only the client id is registered here.
   */
  @Post('installations/:installationId/credentials')
  async createCredential(
    @Param('installationId') installationId: string,
    @Body() dto: CreateMachineCredentialDto,
  ) {
    this.id(installationId, 'Installation');
    const inst = await this.prisma.installation.findUnique({
      where: { id: installationId },
    });
    if (!inst) throw new NotFoundException('Installation not found');

    if (dto.type === EMachineCredentialType.KEYCLOAK_CLIENT) {
      if (!dto.clientId)
        throw new BadRequestException(
          'clientId is required for KEYCLOAK_CLIENT',
        );
      const cred = await this.prisma.machineCredential.create({
        data: {
          installationId,
          type: dto.type,
          clientId: dto.clientId,
          label: dto.label,
        },
      });
      return new GenericResponse('credential', {
        id: cred.id,
        type: cred.type,
        clientId: cred.clientId,
      });
    }

    const key = MachineAuthService.newApiKey();
    const cred = await this.prisma.machineCredential.create({
      data: {
        installationId,
        type: EMachineCredentialType.API_KEY,
        clientId: key.clientId,
        secretHash: sha256(key.secret),
        label: dto.label,
      },
    });
    return new GenericResponse('credential (the apiKey is shown only once)', {
      id: cred.id,
      type: cred.type,
      clientId: cred.clientId,
      apiKey: key.apiKey,
    });
  }

  @HttpCode(200)
  @Delete('credentials/:credentialId')
  async revokeCredential(@Param('credentialId') credentialId: string) {
    this.id(credentialId, 'Credential');
    const { count } = await this.prisma.machineCredential.updateMany({
      where: { id: credentialId },
      data: { active: false, revokedAt: new Date() },
    });
    if (!count) throw new NotFoundException('Credential not found');
    this.machines.forget(credentialId);
    return new GenericResponse('credential revoked', null);
  }
}
