import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Response headers for a JSON API that is never framed or rendered as a page.
 * HSTS only when the request reached Nginx over HTTPS. Swagger (opt-in, never
 * in production) keeps its own page and is left without a CSP.
 */
export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (!req.path.startsWith('/swagger'))
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'",
    );
  if (req.secure || req.headers['x-forwarded-proto'] === 'https')
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  next();
}

export function applyHttpSecurity(app: INestApplication) {
  const http = app.getHttpAdapter().getInstance();
  http.disable?.('x-powered-by');
  // Client IP from X-Forwarded-For only when the request comes from a proxy
  // on this host (Nginx); a client cannot pick its own rate-limit key.
  http.set?.('trust proxy', process.env.TRUST_PROXY || 'loopback');
  app.use(securityHeaders);
}

export interface RateLimitConfig {
  enabled: boolean;
  windowMs: number;
  perIp: number;
  perAccount: number;
}

export const rateLimitConfig = (): RateLimitConfig => ({
  enabled: process.env.AUTH_RATE_LIMIT_ENABLED !== 'false',
  windowMs: (+process.env.AUTH_RATE_LIMIT_WINDOW_S || 900) * 1000,
  perIp: +process.env.AUTH_RATE_LIMIT_PER_IP || 60,
  perAccount: +process.env.AUTH_RATE_LIMIT_PER_ACCOUNT || 10,
});

/**
 * Fixed-window counters in memory. The API runs as one pm2 instance; with
 * more instances each keeps its own counters (limits multiply), so put
 * Nginx `limit_req` in front as well (docs/deployment-runbook.md).
 */
export class AttemptCounter {
  private readonly hits = new Map<string, { n: number; until: number }>();
  constructor(private readonly windowMs: number) {}

  /** Counts one attempt; returns seconds to wait when over `limit`, else 0. */
  hit(key: string, limit: number, now = Date.now()): number {
    if (this.hits.size > 50_000) this.sweep(now);
    const e = this.hits.get(key);
    if (!e || e.until <= now) {
      this.hits.set(key, { n: 1, until: now + this.windowMs });
      return 0;
    }
    e.n++;
    return e.n > limit ? Math.ceil((e.until - now) / 1000) : 0;
  }

  private sweep(now: number) {
    for (const [k, e] of this.hits) if (e.until <= now) this.hits.delete(k);
  }
}

const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;

/**
 * Whether a connection comes from our reverse proxy: loopback (Nginx on this
 * host), or one of the plain IP addresses listed in TRUST_PROXY (Nginx on
 * another host, e.g. TRUST_PROXY=loopback,192.168.160.190).
 */
export function fromTrustedProxy(peer: string): boolean {
  const ip = peer.replace(/^::ffff:/, '');
  if (LOOPBACK.test(peer) || LOOPBACK.test(ip)) return true;
  return (process.env.TRUST_PROXY ?? '')
    .split(',')
    .map((s) => s.trim())
    .includes(ip);
}

/**
 * The client address for rate limiting. Behind Cloudflare → Nginx, req.ip is
 * a Cloudflare edge shared by many users; CLIENT_IP_HEADER (e.g.
 * `cf-connecting-ip`) names the header carrying the real client, trusted only
 * when the request came through our proxy.
 */
export function clientIp(req: Request): string {
  const header = process.env.CLIENT_IP_HEADER?.toLowerCase();
  const peer = req.socket?.remoteAddress ?? '';
  const value = header ? req.headers[header] : undefined;
  if (typeof value === 'string' && value && fromTrustedProxy(peer))
    return value.trim();
  return req.ip ?? peer;
}

/**
 * Brute-force guard for the public password endpoints: per client IP and,
 * when the body names an account, per account (email), whichever trips first.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly cfg = rateLimitConfig();
  private readonly counter = new AttemptCounter(this.cfg.windowMs);

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.cfg.enabled) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const route = `${req.method} ${req.route?.path ?? req.path}`;
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
    const wait = Math.max(
      this.counter.hit(`ip|${route}|${clientIp(req)}`, this.cfg.perIp),
      email
        ? this.counter.hit(`acct|${route}|${email}`, this.cfg.perAccount)
        : 0,
    );
    if (!wait) return true;
    res.setHeader('Retry-After', String(wait));
    throw new HttpException(
      'Too many attempts, try again later',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
