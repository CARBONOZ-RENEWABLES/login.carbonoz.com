import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose';
import { IAppConfig, KeycloakConfig } from 'src/__shared__/interfaces';
import { RedisService } from 'src/redis/redis.service';

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  jwks_uri: string;
}

interface PendingLogin {
  codeVerifier: string;
  nonce: string;
  returnTo: string;
}

export interface OidcClaims extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
}

export interface OidcLoginResult {
  claims: OidcClaims;
  idToken: string;
  refreshToken?: string;
  accessExpiresAt?: number;
  returnTo: string;
}

const PENDING = (state: string) => `oidc-pending:${state}`;
/** Asymmetric algorithms only, as Keycloak signs with realm keys (never HMAC or "none"). */
export const JWT_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
];
const PENDING_TTL = 600;
/** How long a started login stays valid (Redis state and browser cookie). */
export const LOGIN_STATE_TTL_SECONDS = PENDING_TTL;

/**
 * Keycloak OpenID Connect client for the *customer* realm (authorization code
 * + PKCE, confidential client). The client secret and all tokens stay on the
 * server; the browser only ever holds the opaque session cookie.
 */
@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  readonly cfg: KeycloakConfig;
  private discovery?: Promise<Discovery>;
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    config: ConfigService<IAppConfig>,
    private readonly redis: RedisService,
  ) {
    this.cfg = config.get('keycloak');
  }

  get enabled(): boolean {
    const c = this.cfg;
    return !!(
      c?.enabled &&
      c.issuerUrl &&
      c.clientId &&
      c.clientSecret &&
      c.redirectUri
    );
  }

  /** The provider key stored in UserIdentity for this realm. */
  get provider(): string {
    const realm = this.cfg.issuerUrl?.split('/realms/')[1]?.replace(/\/+$/, '');
    return `keycloak:${realm || 'default'}`;
  }

  private assertRedis() {
    if (!this.redis.ready)
      throw new ServiceUnavailableException('Sign-in temporarily unavailable');
  }

  private assertEnabled() {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Single sign-on is not configured');
    }
  }

  private async meta(): Promise<Discovery> {
    if (!this.discovery) {
      const url = `${this.cfg.issuerUrl.replace(
        /\/+$/,
        '',
      )}/.well-known/openid-configuration`;
      this.discovery = axios
        .get<Discovery>(url, { timeout: 5000 })
        .then((r) => {
          if (r.data.issuer !== this.cfg.issuerUrl.replace(/\/+$/, '')) {
            throw new Error(`Issuer mismatch: ${r.data.issuer}`);
          }
          this.jwks = createRemoteJWKSet(new URL(r.data.jwks_uri));
          return r.data;
        })
        .catch((e) => {
          this.discovery = undefined;
          this.logger.error(`OIDC discovery failed: ${e.message}`);
          throw new ServiceUnavailableException(
            'Identity provider unavailable',
          );
        });
    }
    return this.discovery;
  }

  /**
   * Where the browser may be sent after login: a relative path (on the
   * frontend origin) or an absolute URL on an allow-listed origin such as
   * https://solar.carbonoz.com. Anything else falls back to /ds, so the
   * callback can't become an open redirect.
   */
  static safeReturnTo(
    value: string | undefined,
    allowedOrigins: string[] = [],
  ): string {
    if (!value || value.includes('\\')) return '/ds';
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    try {
      const u = new URL(value);
      if (allowedOrigins.includes(u.origin))
        return u.origin + u.pathname + u.search;
    } catch {
      /* not a URL */
    }
    return '/ds';
  }

  /** Authorization URL plus the state, which the caller binds to the browser (cookie). */
  async authorizationUrl(
    returnTo?: string,
    register = false,
  ): Promise<{ url: string; state: string }> {
    this.assertEnabled();
    this.assertRedis();
    const d = await this.meta();
    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const pending: PendingLogin = {
      codeVerifier,
      nonce,
      returnTo: OidcService.safeReturnTo(returnTo, this.cfg.returnOrigins),
    };
    await this.redis.set(PENDING(state), JSON.stringify(pending), PENDING_TTL);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.cfg.clientId,
      redirect_uri: this.cfg.redirectUri,
      scope: this.cfg.scopes,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    if (register) params.set('prompt', 'create');
    return { url: `${d.authorization_endpoint}?${params}`, state };
  }

  async handleCallback(code: string, state: string): Promise<OidcLoginResult> {
    this.assertEnabled();
    this.assertRedis();
    const raw = state ? await this.redis.getDel(PENDING(state)) : null;
    if (!raw)
      throw new UnauthorizedException('Login request expired or invalid');
    const pending = JSON.parse(raw) as PendingLogin;
    const d = await this.meta();

    const tokens = await this.tokenRequest(d, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.cfg.redirectUri,
      code_verifier: pending.codeVerifier,
    });
    if (!tokens.id_token)
      throw new UnauthorizedException('No id_token returned');

    const { payload } = await jwtVerify(tokens.id_token, this.jwks, {
      issuer: d.issuer,
      audience: this.cfg.clientId,
      algorithms: JWT_ALGORITHMS,
    });
    if (payload.nonce !== pending.nonce) {
      throw new UnauthorizedException('Invalid nonce');
    }
    if (!payload.sub) throw new UnauthorizedException('Missing subject');

    return {
      claims: payload as OidcClaims,
      idToken: tokens.id_token,
      refreshToken: tokens.refresh_token,
      accessExpiresAt: tokens.expires_in
        ? Date.now() + tokens.expires_in * 1000
        : undefined,
      returnTo: pending.returnTo,
    };
  }

  /**
   * Refreshes upstream tokens. 'invalid' means Keycloak ended the session
   * (logout, disabled user, revoked); null means a transient failure.
   */
  async refresh(
    refreshToken: string,
  ): Promise<
    | { refreshToken?: string; idToken?: string; accessExpiresAt?: number }
    | 'invalid'
    | null
  > {
    if (!this.enabled) return null;
    try {
      const d = await this.meta();
      const t = await this.tokenRequest(d, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });
      return {
        refreshToken: t.refresh_token,
        idToken: t.id_token,
        accessExpiresAt: t.expires_in
          ? Date.now() + t.expires_in * 1000
          : undefined,
      };
    } catch (e) {
      const status = e?.response?.status ?? e?.status;
      if (status === 400 || status === 401) return 'invalid';
      this.logger.warn(`Token refresh failed: ${e.message}`);
      return null;
    }
  }

  /** Keycloak end-session URL; the browser is sent there after the local session is destroyed. */
  async logoutUrl(idToken?: string): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const d = await this.meta();
      if (!d.end_session_endpoint) return null;
      const params = new URLSearchParams({ client_id: this.cfg.clientId });
      if (idToken) params.set('id_token_hint', idToken);
      if (this.cfg.postLogoutRedirectUri) {
        params.set('post_logout_redirect_uri', this.cfg.postLogoutRedirectUri);
      }
      return `${d.end_session_endpoint}?${params}`;
    } catch {
      return null;
    }
  }

  private async tokenRequest(
    d: Discovery,
    body: Record<string, string>,
  ): Promise<{
    id_token?: string;
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }> {
    try {
      const res = await axios.post(
        d.token_endpoint,
        new URLSearchParams(body).toString(),
        {
          timeout: body.grant_type === 'refresh_token' ? 3000 : 10000,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          auth: {
            username: this.cfg.clientId,
            password: this.cfg.clientSecret,
          },
        },
      );
      return res.data;
    } catch (e) {
      if (body.grant_type === 'refresh_token') throw e;
      this.logger.warn(
        `Token exchange failed: ${e?.response?.status} ${JSON.stringify(
          e?.response?.data ?? e.message,
        )}`,
      );
      throw new UnauthorizedException('Login could not be completed');
    }
  }
}
