import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { Request } from 'express';
import { IAppConfig, SessionConfig } from 'src/__shared__/interfaces';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import { OidcService } from '../oidc/oidc.service';
import { readCookie } from './cookies';

/** Server-side record behind the HttpOnly session cookie. Never sent to the browser. */
export interface SessionRecord {
  userId: string;
  provider: string;
  subject: string;
  idToken?: string;
  refreshToken?: string;
  /** When the upstream access token expires; the session is re-validated with Keycloak after it. */
  accessExpiresAt?: number;
  createdAt: number;
  absoluteExpiresAt: number;
}

const KEY = (hash: string) => `session:${hash}`;
const LOCK = (hash: string) => `session-refresh:${hash}`;
/** After a failed (not rejected) refresh, wait this long before trying again. */
export const REFRESH_BACKOFF_MS = 30_000;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  readonly cfg: SessionConfig;

  constructor(
    config: ConfigService<IAppConfig>,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly oidc: OidcService,
  ) {
    this.cfg = config.get('session');
  }

  /** Redis stores a hash of the cookie value, so a Redis dump holds no usable session ids. */
  private hash(sessionId: string): string {
    return createHash('sha256').update(sessionId).digest('hex');
  }

  async create(
    record: Omit<SessionRecord, 'createdAt' | 'absoluteExpiresAt'>,
  ): Promise<string> {
    const sessionId = randomBytes(32).toString('base64url');
    const now = Date.now();
    const full: SessionRecord = {
      ...record,
      createdAt: now,
      absoluteExpiresAt: now + this.cfg.absoluteTtlSeconds * 1000,
    };
    await this.redis.set(
      KEY(this.hash(sessionId)),
      JSON.stringify(full),
      this.cfg.idleTtlSeconds,
    );
    return sessionId;
  }

  async read(sessionId: string): Promise<SessionRecord | null> {
    const raw = await this.redis.get(KEY(this.hash(sessionId)));
    return raw ? (JSON.parse(raw) as SessionRecord) : null;
  }

  async destroy(sessionId: string): Promise<SessionRecord | null> {
    const key = KEY(this.hash(sessionId));
    const raw = await this.redis.getDel(key);
    return raw ? (JSON.parse(raw) as SessionRecord) : null;
  }

  sessionIdFrom(req: Request): string | undefined {
    return readCookie(req, this.cfg.cookieName);
  }

  /**
   * Resolves the Carbonoz user for a session cookie, or null. Extends the idle
   * TTL and re-validates with Keycloak once the upstream access token expired,
   * so a user disabled or logged out in Keycloak loses access here too.
   */
  async userFromRequest(req: Request): Promise<User | null> {
    const sessionId = this.sessionIdFrom(req);
    if (!sessionId) return null;
    // Commands would queue (hang) while Redis reconnects; fail fast instead.
    if (!this.redis.ready) {
      throw new ServiceUnavailableException(
        'Session store unavailable, retry shortly',
      );
    }
    const hash = this.hash(sessionId);
    const key = KEY(hash);
    const raw = await this.redis.get(key);
    if (!raw) return null;
    let session = JSON.parse(raw) as SessionRecord;
    const now = Date.now();

    if (now > session.absoluteExpiresAt) {
      await this.redis.del(key);
      return null;
    }

    if (
      session.refreshToken &&
      session.accessExpiresAt &&
      now > session.accessExpiresAt &&
      (await this.redis.setIfAbsent(LOCK(hash), '1', 30))
    ) {
      // The lock only de-duplicates concurrent refreshes; release it straight after.
      const refreshed = await this.oidc
        .refresh(session.refreshToken)
        .finally(() => this.redis.del(LOCK(hash)).catch(() => undefined));
      if (refreshed === 'invalid') {
        this.logger.log(
          `Keycloak rejected refresh for sub ${session.subject}; ending session`,
        );
        await this.redis.del(key);
        return null;
      }
      if (refreshed) {
        session = {
          ...session,
          refreshToken: refreshed.refreshToken ?? session.refreshToken,
          idToken: refreshed.idToken ?? session.idToken,
          accessExpiresAt: refreshed.accessExpiresAt,
        };
      }
      if (!refreshed) {
        // Keycloak unreachable or slow: keep the session (its idle/absolute
        // limits still apply) and back off, so requests don't each wait for
        // another refresh attempt. Only a rejected refresh ends the session.
        session = {
          ...session,
          accessExpiresAt: Date.now() + REFRESH_BACKOFF_MS,
        };
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user || user.activeStatus === false) {
      await this.redis.del(key);
      return null;
    }

    const remaining = Math.ceil((session.absoluteExpiresAt - now) / 1000);
    await this.redis.set(
      key,
      JSON.stringify(session),
      Math.min(this.cfg.idleTtlSeconds, remaining),
    );
    return user;
  }
}
