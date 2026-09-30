import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { IAppConfig, SolarConfig } from 'src/__shared__/interfaces';
import { MachinePrincipal } from 'src/machine-auth/machine-auth.service';
import { RedisService } from 'src/redis/redis.service';
import { DEDUPE_TTL_SECONDS, SolarKeys } from '../solar.keys';

export interface StreamMessage {
  installationId: string;
  siteId: string;
  messageId: string;
  receivedAt: string;
  payload: string;
}

export interface IngestResult {
  messageId: string;
  status: 'queued' | 'duplicate';
}

const MAX_BATCH = 100;
const PENDING_TTL_SECONDS = 60;

/**
 * API side of ingestion: authenticate (guard), minimal checks, dedupe, and
 * hand the untouched payload to the Redis stream. Parsing happens in the worker,
 * so a new SolarBMS payload shape can never make the endpoint reject data.
 */
@Injectable()
export class SolarIngestService {
  private readonly logger = new Logger(SolarIngestService.name);
  private readonly cfg: SolarConfig;

  constructor(
    config: ConfigService<IAppConfig>,
    private readonly redis: RedisService,
  ) {
    this.cfg = config.get('solar');
  }

  async accept(
    machine: MachinePrincipal,
    body: unknown,
  ): Promise<IngestResult[]> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException('Expected a JSON object');
    }
    const b = body as Record<string, unknown>;
    const messages = Array.isArray(b.messages) ? b.messages : [b];
    if (!messages.length || messages.length > MAX_BATCH) {
      throw new BadRequestException(`Send between 1 and ${MAX_BATCH} messages`);
    }
    const results: IngestResult[] = [];
    for (const m of messages) {
      if (typeof m !== 'object' || m === null || Array.isArray(m)) {
        throw new BadRequestException('Every message must be a JSON object');
      }
      try {
        results.push(await this.enqueue(machine, m as Record<string, unknown>));
      } catch (e) {
        if (e instanceof HttpException) throw e;
        // Redis failed mid-batch. Retrying the whole batch is safe: already
        // queued messages come back as "duplicate".
        this.logger.error(`Ingest failed: ${e.message}`);
        throw new ServiceUnavailableException(
          'Ingestion temporarily unavailable, retry later',
        );
      }
    }
    return results;
  }

  private async enqueue(
    machine: MachinePrincipal,
    m: Record<string, unknown>,
  ): Promise<IngestResult> {
    const systemId = m.systemId ?? m.system_id;
    if (
      machine.externalSystemId &&
      systemId != null &&
      String(systemId) !== machine.externalSystemId
    ) {
      // A credential may only report for the system it was issued to.
      throw new ConflictException('systemId does not match this installation');
    }
    const payload = JSON.stringify(m);
    const given =
      typeof m.messageId === 'string'
        ? m.messageId
        : typeof m.message_id === 'string'
        ? m.message_id
        : null;
    const messageId =
      given && given.length <= 128
        ? given
        : `sha256:${createHash('sha256').update(payload).digest('hex')}`;

    if (!this.redis.ready) {
      throw new ServiceUnavailableException(
        'Ingestion temporarily unavailable, retry later',
      );
    }
    // Backpressure instead of trimming: never drop messages the worker hasn't stored yet.
    if (
      (await this.redis.raw.xLen(this.cfg.streamKey)) >= this.cfg.streamMaxLen
    ) {
      this.logger.warn(
        `Stream ${this.cfg.streamKey} is full; rejecting until the worker catches up`,
      );
      throw new ServiceUnavailableException('Ingestion backlog, retry later');
    }
    const seenKey = SolarKeys.seen(machine.installationId, messageId);
    // Short "pending" marker first: if we crash before XADD the sender's retry
    // is accepted once it expires instead of being reported as a duplicate.
    if (
      !(await this.redis.setIfAbsent(seenKey, 'pending', PENDING_TTL_SECONDS))
    ) {
      this.count(machine.installationId, 'duplicate');
      return { messageId, status: 'duplicate' };
    }
    const fields: StreamMessage = {
      installationId: machine.installationId,
      siteId: machine.siteId,
      messageId,
      receivedAt: new Date().toISOString(),
      payload,
    };
    try {
      await this.redis.raw.xAdd(this.cfg.streamKey, '*', { ...fields });
      await this.redis.set(seenKey, 'queued', DEDUPE_TTL_SECONDS);
    } catch (e) {
      await this.redis.del(seenKey).catch(() => undefined);
      this.logger.error(`XADD failed: ${e.message}`);
      throw new ServiceUnavailableException(
        'Ingestion temporarily unavailable, retry later',
      );
    }
    this.count(machine.installationId, 'accepted');
    return { messageId, status: 'queued' };
  }

  /**
   * Monitoring counters for the admin panel. Fire-and-forget: a failure here
   * (e.g. a Redis ACL without HINCRBY) must never affect ingestion.
   */
  private count(installationId: string, field: 'accepted' | 'duplicate') {
    this.redis.raw
      .hIncrBy(SolarKeys.stats(installationId), field, 1)
      .catch(() => undefined);
  }
}
