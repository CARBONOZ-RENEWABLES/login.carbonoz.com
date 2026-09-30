import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { IAppConfig } from 'src/__shared__/interfaces';
import { Request } from 'express';
import { SessionService } from '../session/session.service';

export const CSRF_HEADER = 'x-carbonoz-csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie sessions are sent by the browser automatically, so state-changing
 * requests must also carry a header a cross-site form or image can't set.
 * SameSite=Lax alone does not cover sibling subdomains (solar.carbonoz.com).
 */
export function assertCsrfHeader(req: Request): void {
  if (!SAFE_METHODS.has(req.method) && !req.headers[CSRF_HEADER]) {
    throw new ForbiddenException('Missing CSRF header');
  }
}

/**
 * Human authentication for every existing controller: a server-side session
 * cookie (Keycloak login) or, unchanged, the legacy bearer JWT. Machine
 * (SolarBMS) credentials are never accepted here — see MachineAuthGuard.
 */
@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  constructor(
    private readonly sessions: SessionService,
    private readonly config: ConfigService<IAppConfig>,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: unknown }>();
    if (!req.headers.authorization) {
      const user = await this.sessions.userFromRequest(req);
      if (user) {
        assertCsrfHeader(req);
        req.user = user;
        return true;
      }
    }
    if (this.config.get('legacyAuthEnabled') === false) {
      throw new UnauthorizedException('Sign in with CARBONOZ single sign-on');
    }
    return super.canActivate(context) as Promise<boolean>;
  }
}
