import { Request, Response } from 'express';
import { SessionConfig } from 'src/__shared__/interfaces';

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers?.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function writeSessionCookie(
  res: Response,
  cfg: SessionConfig,
  value: string,
): void {
  res.cookie(cfg.cookieName, value, {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: 'lax',
    domain: cfg.cookieDomain,
    path: '/',
    maxAge: cfg.absoluteTtlSeconds * 1000,
  });
}

const STATE_COOKIE = 'cz_oidc_state';
const STATE_PATH = '/api/v1/auth/oidc';

/**
 * Binds a started login to this browser: the callback must present the same
 * (hashed) state, so a callback URL obtained in another browser is rejected
 * (login CSRF). Lax is enough: the callback is a top-level GET navigation.
 */
export function writeStateCookie(
  res: Response,
  cfg: SessionConfig,
  stateHash: string,
  ttlSeconds: number,
): void {
  res.cookie(STATE_COOKIE, stateHash, {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: 'lax',
    domain: cfg.cookieDomain,
    path: STATE_PATH,
    maxAge: ttlSeconds * 1000,
  });
}

export const readStateCookie = (req: Request) => readCookie(req, STATE_COOKIE);

export function clearStateCookie(res: Response, cfg: SessionConfig): void {
  res.clearCookie(STATE_COOKIE, {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: 'lax',
    domain: cfg.cookieDomain,
    path: STATE_PATH,
  });
}

export function clearSessionCookie(res: Response, cfg: SessionConfig): void {
  res.clearCookie(cfg.cookieName, {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: 'lax',
    domain: cfg.cookieDomain,
    path: '/',
  });
}
