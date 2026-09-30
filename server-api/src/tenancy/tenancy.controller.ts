import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
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
  UpdateCustomerDto,
  UpdateInstallationDto,
} from './dto';
import { CurrentSite, SiteAccessGuard } from './site-access.guard';
import { isObjectId, TenancyService } from './tenancy.service';
import { findUserByEmail } from 'src/__shared__/utils/email';
import {
  containsFilter,
  queryEnum,
  queryId,
  queryString,
} from 'src/__shared__/utils/query';
import { combinedStatus, installationStatus } from './installation-status';

/** Fields of a machine credential that may leave the API (never secretHash). */
const CREDENTIAL_FIELDS = {
  id: true,
  installationId: true,
  type: true,
  clientId: true,
  active: true,
  label: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

/** Member's account as the admin panel shows it; names live in UserInformation. */
const MEMBER_USER_FIELDS = {
  id: true,
  email: true,
  activeStatus: true,
  role: true,
  UserInformation: {
    select: { firstName: true, lastName: true },
    take: 1,
  },
} as const;

type MemberUser = {
  id: string;
  email: string | null;
  activeStatus: boolean;
  role: ERole;
  UserInformation: { firstName: string | null; lastName: string | null }[];
};

const memberView = <M extends { user: MemberUser }>({ user, ...m }: M) => {
  const { UserInformation, ...u } = user;
  return {
    ...m,
    user: {
      ...u,
      firstName: UserInformation[0]?.firstName ?? null,
      lastName: UserInformation[0]?.lastName ?? null,
    },
  };
};

const latest = (dates: (Date | null)[]) =>
  dates.reduce<Date | null>((a, d) => (d && (!a || d > a) ? d : a), null);

function credentialStatus(c: {
  active: boolean;
  revokedAt: Date | null;
}): 'active' | 'revoked' {
  return c.active && !c.revokedAt ? 'active' : 'revoked';
}

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

  @ApiOkResponse({
    description:
      'Customers with member/site/installation counts, last activity and status',
  })
  @Get('customers')
  async customers(@Query('q') q?: unknown) {
    const search = queryString(q, 'q');
    const data = await this.prisma.customer.findMany({
      where: search
        ? {
            OR: [
              { name: containsFilter(search) },
              ...(isObjectId(search) ? [{ id: search }] : []),
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          include: {
            user: { select: MEMBER_USER_FIELDS },
          },
        },
        sites: {
          select: {
            id: true,
            name: true,
            installations: { select: { active: true, lastSeenAt: true } },
          },
        },
      },
    });
    return new GenericResponse(
      'customers',
      data.map(({ sites, ...c }) => {
        const installs = sites.flatMap((x) => x.installations);
        return {
          ...c,
          members: c.members.map(memberView),
          sites: sites.map(({ id, name }) => ({ id, name })),
          memberCount: c.members.length,
          siteCount: sites.length,
          installationCount: installs.length,
          lastActivityAt: latest(installs.map((i) => i.lastSeenAt)),
          status: combinedStatus(installs),
        };
      }),
    );
  }

  @ApiOkResponse({ description: 'One customer with members and sites' })
  @Get('customers/:customerId')
  async customer(@Param('customerId') customerId: string) {
    this.id(customerId, 'Customer');
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        members: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: MEMBER_USER_FIELDS },
          },
        },
        sites: {
          orderBy: { createdAt: 'asc' },
          include: {
            installations: {
              select: {
                id: true,
                name: true,
                kind: true,
                active: true,
                lastSeenAt: true,
                externalSystemId: true,
              },
            },
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Customer not found');
    return new GenericResponse('customer', {
      ...c,
      members: c.members.map(memberView),
      sites: c.sites.map((site) => ({
        ...site,
        status: combinedStatus(site.installations),
        lastSeenAt: latest(site.installations.map((i) => i.lastSeenAt)),
        installations: site.installations.map((i) => ({
          ...i,
          status: installationStatus(i),
        })),
      })),
    });
  }

  @Patch('customers/:customerId')
  async updateCustomer(
    @Param('customerId') customerId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    this.id(customerId, 'Customer');
    const { count } = await this.prisma.customer.updateMany({
      where: { id: customerId },
      data: { name: dto.name, type: dto.type },
    });
    if (!count) throw new NotFoundException('Customer not found');
    return new GenericResponse(
      'customer',
      await this.prisma.customer.findUnique({ where: { id: customerId } }),
    );
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

  @ApiOkResponse({
    description: 'All sites with customer, installation count and status',
  })
  @Get('sites')
  async allSites(@Query('q') q?: unknown, @Query('customerId') cid?: unknown) {
    const search = queryString(q, 'q');
    const customerId = queryId(cid, 'customerId');
    const data = await this.prisma.site.findMany({
      where: {
        ...(customerId && { customerId }),
        ...(search && {
          OR: [
            { name: containsFilter(search) },
            { customer: { name: containsFilter(search) } },
            ...(isObjectId(search) ? [{ id: search }] : []),
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
        installations: {
          select: { id: true, name: true, active: true, lastSeenAt: true },
        },
      },
    });
    return new GenericResponse(
      'sites',
      data.map(({ installations, ...site }) => ({
        ...site,
        installationCount: installations.length,
        installations: installations.map((i) => ({
          ...i,
          status: installationStatus(i),
        })),
        lastSeenAt: latest(installations.map((i) => i.lastSeenAt)),
        status: combinedStatus(installations),
      })),
    );
  }

  @Get('sites/:siteId/installations')
  async installations(@Param('siteId') siteId: string) {
    this.id(siteId, 'Site');
    const data = await this.prisma.installation.findMany({
      where: { siteId },
      include: {
        // Never return secretHash.
        machineCredentials: { select: CREDENTIAL_FIELDS },
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

  @ApiOkResponse({
    description:
      'All installations with site, customer, credentials and device count',
  })
  @Get('installations')
  async allInstallations(
    @Query('q') q?: unknown,
    @Query('siteId') sid?: unknown,
    @Query('customerId') cid?: unknown,
  ) {
    const search = queryString(q, 'q');
    const siteId = queryId(sid, 'siteId');
    const customerId = queryId(cid, 'customerId');
    const data = await this.prisma.installation.findMany({
      where: {
        ...(siteId && { siteId }),
        ...(customerId && { site: { customerId } }),
        ...(search && {
          OR: [
            { name: containsFilter(search) },
            { externalSystemId: containsFilter(search) },
            { site: { name: containsFilter(search) } },
            ...(isObjectId(search) ? [{ id: search }] : []),
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            customer: { select: { id: true, name: true } },
          },
        },
        machineCredentials: {
          select: CREDENTIAL_FIELDS,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    const devices = data.length
      ? await this.prisma.solarDevice.groupBy({
          by: ['installationId'],
          where: { installationId: { in: data.map((i) => i.id) } },
          _count: { _all: true },
        })
      : [];
    const deviceCount = new Map(
      devices.map((d) => [d.installationId, d._count._all]),
    );
    return new GenericResponse(
      'installations',
      data.map((i) => ({
        ...i,
        status: installationStatus(i),
        deviceCount: deviceCount.get(i.id) ?? 0,
        activeCredentials: i.machineCredentials.filter(
          (c) => credentialStatus(c) === 'active',
        ).length,
        credentialLastUsedAt: latest(
          i.machineCredentials.map((c) => c.lastUsedAt),
        ),
      })),
    );
  }

  @Patch('installations/:installationId')
  async updateInstallation(
    @Param('installationId') installationId: string,
    @Body() dto: UpdateInstallationDto,
  ) {
    this.id(installationId, 'Installation');
    const { count } = await this.prisma.installation.updateMany({
      where: { id: installationId },
      data: {
        name: dto.name,
        active: dto.active,
        ...(dto.externalSystemId !== undefined && {
          externalSystemId: dto.externalSystemId.trim() || null,
        }),
      },
    });
    if (!count) throw new NotFoundException('Installation not found');
    // Cached principals carry `active` and the bound systemId: drop them now.
    this.machines.forgetInstallation(installationId);
    return new GenericResponse(
      'installation',
      await this.prisma.installation.findUnique({
        where: { id: installationId },
      }),
    );
  }

  @ApiOkResponse({
    description: 'Machine credentials (metadata only, never secrets)',
  })
  @Get('credentials')
  async credentials(
    @Query('installationId') iid?: unknown,
    @Query('status') st?: unknown,
    @Query('q') q?: unknown,
  ) {
    const installationId = queryId(iid, 'installationId');
    const status = queryEnum(st, 'status', ['active', 'revoked'] as const);
    const search = queryString(q, 'q');
    const data = await this.prisma.machineCredential.findMany({
      where: {
        ...(installationId && { installationId }),
        ...(status === 'active' && { active: true, revokedAt: null }),
        ...(status === 'revoked' && {
          OR: [{ active: false }, { revokedAt: { not: null } }],
        }),
        ...(search && {
          AND: [
            {
              OR: [
                { clientId: containsFilter(search) },
                { label: containsFilter(search) },
                { installation: { name: containsFilter(search) } },
              ],
            },
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        ...CREDENTIAL_FIELDS,
        installation: {
          select: {
            id: true,
            name: true,
            active: true,
            externalSystemId: true,
            site: {
              select: {
                id: true,
                name: true,
                customer: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    return new GenericResponse(
      'credentials',
      data.map((c) => ({ ...c, status: credentialStatus(c) })),
    );
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

  /**
   * API keys: issues a new key for the same installation and revokes the old
   * one in the same step; the new key is in this response only. Keycloak
   * client secrets are rotated in Keycloak, not here.
   */
  @Post('credentials/:credentialId/rotate')
  async rotateCredential(@Param('credentialId') credentialId: string) {
    this.id(credentialId, 'Credential');
    const old = await this.prisma.machineCredential.findUnique({
      where: { id: credentialId },
    });
    if (!old) throw new NotFoundException('Credential not found');
    if (old.type !== EMachineCredentialType.API_KEY)
      throw new BadRequestException(
        'Keycloak client credentials are rotated in Keycloak (regenerate the client secret)',
      );
    if (credentialStatus(old) !== 'active')
      throw new BadRequestException('Only an active credential can be rotated');
    const key = MachineAuthService.newApiKey();
    const [cred] = await this.prisma.$transaction([
      this.prisma.machineCredential.create({
        data: {
          installationId: old.installationId,
          type: EMachineCredentialType.API_KEY,
          clientId: key.clientId,
          secretHash: sha256(key.secret),
          label: old.label,
        },
      }),
      this.prisma.machineCredential.update({
        where: { id: old.id },
        data: { active: false, revokedAt: new Date() },
      }),
    ]);
    this.machines.forget(old.id);
    return new GenericResponse(
      'credential rotated (the apiKey is shown only once)',
      {
        id: cred.id,
        type: cred.type,
        clientId: cred.clientId,
        apiKey: key.apiKey,
        revokedCredentialId: old.id,
      },
    );
  }
}
