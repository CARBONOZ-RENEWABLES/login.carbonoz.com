import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request, Response } from 'express';
import { IAppConfig } from 'src/__shared__/interfaces';
import { GetUser } from '../decorators';
import { assertCsrfHeader, JwtGuard } from '../guard/jwt.guard';
import {
  clearSessionCookie,
  clearStateCookie,
  readStateCookie,
  writeSessionCookie,
  writeStateCookie,
} from '../session/cookies';
import { createHash, timingSafeEqual } from 'crypto';
import { SessionService } from '../session/session.service';
import { IdentityService } from './identity.service';
import { LOGIN_STATE_TTL_SECONDS, OidcService } from './oidc.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const sameHash = (
  cookieHash: string | undefined,
  state: string | undefined,
) => {
  if (!cookieHash || !state) return false;
  const a = Buffer.from(cookieHash);
  const b = Buffer.from(sha256(state));
  return a.length === b.length && timingSafeEqual(a, b);
};

@Controller('auth')
@ApiTags('auth')
export class OidcController {
  private readonly logger = new Logger(OidcController.name);

  constructor(
    private readonly oidc: OidcService,
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<IAppConfig>,
  ) {}

  private front(path: string): string {
    return `${(this.config.get('frontedUrl') || '').replace(
      /\/+$/,
      '',
    )}${path}`;
  }

  @ApiOperation({ summary: 'Which sign-in methods the frontend should offer' })
  @Get('config')
  authConfig() {
    return { data: { sso: this.oidc.enabled } };
  }

  @ApiExcludeEndpoint()
  @Get('oidc/login')
  async login(
    @Query('returnTo') returnTo: string,
    @Query('register') register: string,
    @Res() res: Response,
  ) {
    const { url, state } = await this.oidc.authorizationUrl(
      returnTo,
      register === '1',
    );
    writeStateCookie(
      res,
      this.sessions.cfg,
      sha256(state),
      LOGIN_STATE_TTL_SECONDS,
    );
    res.redirect(302, url);
  }

  @ApiExcludeEndpoint()
  @Get('oidc/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Checked before the state is consumed, so a foreign callback URL can't
    // burn a pending login either.
    const bound = readStateCookie(req);
    clearStateCookie(res, this.sessions.cfg);
    if (!error && code && !sameHash(bound, state)) {
      this.logger.warn('SSO callback without a matching login-state cookie');
      return res.redirect(302, this.front('/?sso_error=login_state_mismatch'));
    }
    if (error || !code) {
      return res.redirect(
        302,
        this.front(
          `/?sso_error=${encodeURIComponent(error || 'missing_code')}`,
        ),
      );
    }
    try {
      const result = await this.oidc.handleCallback(code, state);
      const user = await this.identity.resolveUser(
        this.oidc.provider,
        result.claims,
        this.oidc.cfg.linkByEmail,
      );
      const sessionId = await this.sessions.create({
        userId: user.id,
        provider: this.oidc.provider,
        subject: result.claims.sub,
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        accessExpiresAt: result.accessExpiresAt,
      });
      writeSessionCookie(res, this.sessions.cfg, sessionId);
      // returnTo is a relative path or an allow-listed absolute URL (see safeReturnTo).
      const target = new URL(
        result.returnTo,
        this.front('/') || 'http://localhost',
      );
      if (user.role === 'ADMIN' && target.pathname === '/ds')
        target.pathname = '/admin';
      return res.redirect(
        302,
        result.returnTo.startsWith('/')
          ? this.front(target.pathname + target.search)
          : target.toString(),
      );
    } catch (e) {
      const reason =
        e instanceof HttpException && typeof e.getResponse() === 'object'
          ? String(
              (e.getResponse() as { message?: string }).message ??
                'login_failed',
            )
          : 'login_failed';
      this.logger.warn(`SSO callback failed: ${e.message}`);
      return res.redirect(
        302,
        this.front(`/?sso_error=${encodeURIComponent(reason)}`),
      );
    }
  }

  @ApiOkResponse({
    description: 'Current signed-in user (session cookie or bearer token)',
  })
  @ApiOperation({ summary: 'Current session' })
  @UseGuards(JwtGuard)
  @Get('session')
  session(@GetUser() user: User) {
    const { id, email, role, active } = user;
    return { data: { user: { id, email, role, active } } };
  }

  @ApiOperation({ summary: 'End the server-side session' })
  @HttpCode(200)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertCsrfHeader(req);
    const sessionId = this.sessions.sessionIdFrom(req);
    const record = sessionId ? await this.sessions.destroy(sessionId) : null;
    clearSessionCookie(res, this.sessions.cfg);
    const logoutUrl = record ? await this.oidc.logoutUrl(record.idToken) : null;
    return { data: { logoutUrl } };
  }
}
