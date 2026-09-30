import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ERole, Site } from '@prisma/client';
import { GenericResponse } from 'src/__shared__/dto';
import { AllowRoles } from 'src/auth/decorators';
import { JwtGuard } from 'src/auth/guard/jwt.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import {
  GetMachine,
  MachineAuthGuard,
} from 'src/machine-auth/machine-auth.guard';
import { MachinePrincipal } from 'src/machine-auth/machine-auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { IAppConfig } from 'src/__shared__/interfaces';
import { SolarKeys } from './solar.keys';
import { CurrentSite, SiteAccessGuard } from 'src/tenancy/site-access.guard';
import { isObjectId } from 'src/tenancy/tenancy.service';
import {
  CellsQueryDto,
  DeviceKindQueryDto,
  EventsQueryDto,
  HistoryQueryDto,
} from './dto';
import { SolarIngestService } from './ingest/solar-ingest.service';
import { SolarReadService } from './read/solar-read.service';
import { SolarStoreService } from './store/solar-store.service';

/** Customer read API. Site access is checked server-side for every route. */
@Controller('solar/sites/:siteId')
@ApiTags('solar')
@UseGuards(JwtGuard, RolesGuard, SiteAccessGuard)
@AllowRoles(ERole.USER, ERole.ADMIN)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class SolarController {
  constructor(private readonly read: SolarReadService) {}

  @ApiOperation({
    summary:
      'Authorisation probe for the reverse proxy (nginx auth_request): 204 or 401/404',
  })
  @HttpCode(204)
  @Get('access')
  access() {
    // The guards did the work: authenticated human with access to this site.
  }

  @ApiOperation({
    summary:
      'Live overview: devices with latest values, metric catalogue, alarm count',
  })
  @Get('overview')
  async overview(@CurrentSite() site: Site) {
    return new GenericResponse(
      'solar-overview',
      await this.read.overview(site),
    );
  }

  @Get('devices')
  async devices(@CurrentSite() site: Site, @Query() q: DeviceKindQueryDto) {
    return new GenericResponse(
      'solar-devices',
      await this.read.devices(site, q.kind),
    );
  }

  @Get('inverters')
  async inverters(@CurrentSite() site: Site) {
    return new GenericResponse(
      'solar-inverters',
      await this.read.devices(site, 'INVERTER'),
    );
  }

  @Get('batteries')
  async batteries(@CurrentSite() site: Site) {
    return new GenericResponse(
      'solar-batteries',
      await this.read.devices(site, 'BATTERY'),
    );
  }

  @Get('bms')
  async bms(@CurrentSite() site: Site) {
    return new GenericResponse(
      'solar-bms',
      await this.read.devices(site, 'BMS'),
    );
  }

  @Get('cells')
  async cells(@CurrentSite() site: Site, @Query() q: CellsQueryDto) {
    return new GenericResponse(
      'solar-cells',
      await this.read.cells(site, q.bmsId),
    );
  }

  @Get('metrics')
  async metrics(@CurrentSite() site: Site) {
    return new GenericResponse('solar-metrics', await this.read.metrics(site));
  }

  @ApiOperation({
    summary: 'Bucketed history of one metric, one series per device',
  })
  @Get('history')
  async history(@CurrentSite() site: Site, @Query() q: HistoryQueryDto) {
    return new GenericResponse(
      'solar-history',
      await this.read.history(site, { ...q, kind: q.kind ?? 'SYSTEM' }),
    );
  }

  @Get('events')
  async events(@CurrentSite() site: Site, @Query() q: EventsQueryDto) {
    return new GenericResponse('solar-events', await this.read.events(site, q));
  }

  @Get('forecast')
  async forecast(@CurrentSite() site: Site) {
    return new GenericResponse(
      'solar-forecast',
      await this.read.forecast(site),
    );
  }
}

/** Machine ingestion. SolarBMS devices only — no user token is accepted here. */
@Controller('ingest/solarbms')
@ApiTags('solar-ingest')
@UseGuards(MachineAuthGuard)
@ApiBearerAuth()
export class SolarIngestController {
  constructor(private readonly ingest: SolarIngestService) {}

  @ApiOperation({
    summary: 'Submit one SolarBMS message, or { messages: [...] }',
  })
  @ApiAcceptedResponse({ description: 'Queued for processing' })
  @HttpCode(202)
  @Post()
  async submit(
    @GetMachine() machine: MachinePrincipal,
    @Body() body: Record<string, unknown>,
  ) {
    return new GenericResponse(
      'accepted',
      await this.ingest.accept(machine, body),
    );
  }
}

@Controller('admin/solar')
@ApiTags('admin')
@UseGuards(JwtGuard, RolesGuard)
@AllowRoles(ERole.ADMIN)
@ApiBearerAuth()
export class AdminSolarController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: SolarStoreService,
    private readonly redis: RedisService,
    config: ConfigService<IAppConfig>,
  ) {
    this.solarStreamKey = config.get('solar').streamKey;
  }

  private readonly solarStreamKey: string;

  @ApiOperation({
    summary:
      'Messages the worker gave up on (MongoDB records and the Redis fallback stream)',
  })
  @Get('dead-letters')
  async deadLetters() {
    const [stored, fallback] = await Promise.all([
      this.prisma.solarDeadLetter.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.redis.raw
        .xRevRange(SolarKeys.deadLetters, '+', '-', { COUNT: 100 })
        .catch(() => []),
    ]);
    return new GenericResponse('solar-dead-letters', {
      stored,
      redisFallback: fallback,
    });
  }

  @ApiOperation({
    summary: 'Put a dead-lettered message back on the ingestion stream',
  })
  @HttpCode(200)
  @Post('dead-letters/:id/requeue')
  async requeue(@Param('id') id: string) {
    if (!isObjectId(id)) throw new NotFoundException('Dead letter not found');
    const dl = await this.prisma.solarDeadLetter.findUnique({ where: { id } });
    if (!dl || !dl.installationId || !dl.siteId || !dl.messageId) {
      throw new NotFoundException('Dead letter not found or not requeueable');
    }
    const streamId = await this.redis.raw.xAdd(this.solarStreamKey, '*', {
      installationId: dl.installationId,
      siteId: dl.siteId,
      messageId: dl.messageId,
      receivedAt: (dl.receivedAt ?? dl.createdAt).toISOString(),
      payload: dl.rawText,
    });
    await this.prisma.solarDeadLetter.delete({ where: { id } });
    return new GenericResponse('requeued', { streamId });
  }

  @ApiOkResponse({ description: 'Recent raw payloads for a site' })
  @Get('sites/:siteId/ingests')
  async ingests(@Param('siteId') siteId: string) {
    if (!isObjectId(siteId)) throw new NotFoundException('Site not found');
    const data = await this.prisma.solarIngest.findMany({
      where: { siteId },
      orderBy: { receivedAt: 'desc' },
      take: 50,
    });
    return new GenericResponse('solar-ingests', data);
  }

  @ApiOperation({ summary: 'Re-run normalization for a stored raw payload' })
  @HttpCode(200)
  @Post('ingests/:ingestId/reprocess')
  async reprocess(@Param('ingestId') ingestId: string) {
    if (!isObjectId(ingestId)) throw new NotFoundException('Ingest not found');
    await this.store.derive(ingestId);
    const row = await this.prisma.solarIngest.findUnique({
      where: { id: ingestId },
      select: { id: true, status: true, error: true, processedAt: true },
    });
    if (!row) throw new NotFoundException('Ingest not found');
    return new GenericResponse('reprocessed', row);
  }
}
