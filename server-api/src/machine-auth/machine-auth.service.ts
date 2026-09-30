import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EMachineCredentialType,
  Installation,
  MachineCredential,
} from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { createRemoteJWKSet, decodeJwt, JWTPayload, jwtVerify } from 'jose';
import { IAppConfig, MachineAuthConfig } from 'src/__shared__/interfaces';
import { JWT_ALGORITHMS } from 'src/auth/oidc/oidc.service';
import { PrismaService } from 'src/prisma/prisma.service';

/** What an authenticated SolarBMS device may act as: one installation, never a user. */
export interface MachinePrincipal {
  credentialId: string;
  clientId: string;
  type: EMachineCredentialType;
  installationId: string;
  siteId: string;
  externalSystemId?: string | null;
}

const API_KEY_PREFIX = 'czk';
const CACHE_MS = 60_000;
const LOOKUP_TIMEOUT_MS = 5_000;

export const sha256 = (v: string) =>
  createHash('sha256').update(v).digest('hex');

@Injectable()
export class MachineAuthService {
  private readonly logger = new Logger(MachineAuthService.name);
  readonly cfg: MachineAuthConfig;
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    config: ConfigService<IAppConfig>,
    private readonly prisma: PrismaService,
  ) {
    this.cfg = config.get('machineAuth');
  }

  get keycloakEnabled(): boolean {
    return !!(this.cfg.keycloakIssuerUrl && this.cfg.keycloakAudience);
  }

  /** A new API key. The full key is shown once; only a hash of the secret is stored. */
  static newApiKey(): { clientId: string; secret: string; apiKey: string } {
    const clientId = randomBytes(12).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    return {
      clientId,
      secret,
      apiKey: `${API_KEY_PREFIX}.${clientId}.${secret}`,
    };
  }

  /**
   * Verified credentials, remembered briefly so devices keep sending (into
   * Redis) through a short MongoDB outage. Revocation takes effect within
   * CACHE_MS on every API instance.
   */
  private readonly cache = new Map<
    string,
    { principal: MachinePrincipal; until: number }
  >();

  async authenticate(authorization?: string): Promise<MachinePrincipal> {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) throw new UnauthorizedException('Missing machine credentials');
    const cacheKey = sha256(token);
    const hit = this.cache.get(cacheKey);
    if (hit && hit.until > Date.now()) return hit.principal;
    const principal = await this.verify(token);
    if (this.cache.size > 10_000) this.cache.clear();
    // A cached Keycloak token must never outlive its own expiry.
    const exp = token.startsWith(`${API_KEY_PREFIX}.`)
      ? undefined
      : decodeJwt(token).exp;
    const until = Math.min(Date.now() + CACHE_MS, exp ? exp * 1000 : Infinity);
    this.cache.set(cacheKey, { principal, until });
    return principal;
  }

  /** Drops cached entries of a revoked credential on this instance right away. */
  forget(credentialId: string) {
    for (const [k, v] of this.cache)
      if (v.principal.credentialId === credentialId) this.cache.delete(k);
  }

  /** Same for every credential of an installation (deactivated, systemId changed). */
  forgetInstallation(installationId: string) {
    for (const [k, v] of this.cache)
      if (v.principal.installationId === installationId) this.cache.delete(k);
  }

  private async verify(token: string): Promise<MachinePrincipal> {
    if (token.startsWith(`${API_KEY_PREFIX}.`)) {
      if (!this.cfg.apiKeysEnabled)
        throw new UnauthorizedException('API keys are disabled');
      return this.fromApiKey(token);
    }
    if (token.split('.').length === 3 && this.keycloakEnabled) {
      return this.fromKeycloakToken(token);
    }
    throw new UnauthorizedException('Invalid machine credentials');
  }

  /** Credential lookup bounded to LOOKUP_TIMEOUT_MS so a database outage fails fast. */
  private lookup(clientId: string) {
    let timer: NodeJS.Timeout;
    return Promise.race([
      this.prisma.machineCredential.findUnique({
        where: { clientId },
        include: { installation: true },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('credential lookup timed out')),
          LOOKUP_TIMEOUT_MS,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  }

  private async fromApiKey(token: string): Promise<MachinePrincipal> {
    const [, clientId, secret] = token.split('.');
    if (!clientId || !secret)
      throw new UnauthorizedException('Invalid machine credentials');
    const cred = await this.lookup(clientId);
    const expected = cred?.secretHash
      ? Buffer.from(cred.secretHash, 'hex')
      : Buffer.alloc(32);
    const actual = Buffer.from(sha256(secret), 'hex');
    const match = timingSafeEqual(expected, actual);
    if (!cred || !match || cred.type !== EMachineCredentialType.API_KEY) {
      throw new UnauthorizedException('Invalid machine credentials');
    }
    return this.principal(cred);
  }

  /**
   * Keycloak client-credentials token from the *machine* realm. Issuer,
   * audience, expiry and the ingest role are all required; the client id must
   * be registered to an installation.
   */
  private async fromKeycloakToken(token: string): Promise<MachinePrincipal> {
    const issuer = this.cfg.keycloakIssuerUrl.replace(/\/+$/, '');
    this.jwks ??= createRemoteJWKSet(
      new URL(`${issuer}/protocol/openid-connect/certs`),
    );
    let payload: JWTPayload & {
      azp?: string;
      client_id?: string;
      realm_access?: { roles?: string[] };
      resource_access?: Record<string, { roles?: string[] }>;
    };
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer,
        audience: this.cfg.keycloakAudience,
        requiredClaims: ['exp'],
        algorithms: JWT_ALGORITHMS,
      }));
    } catch (e) {
      this.logger.debug(`Machine token rejected: ${e.message}`);
      throw new UnauthorizedException('Invalid machine credentials');
    }
    const roles = [
      ...(payload.realm_access?.roles ?? []),
      ...(payload.resource_access?.[this.cfg.keycloakAudience]?.roles ?? []),
    ];
    if (!roles.includes(this.cfg.requiredRole)) {
      throw new UnauthorizedException('Machine client lacks the ingest role');
    }
    const clientId = payload.azp || payload.client_id;
    const cred = clientId ? await this.lookup(clientId) : null;
    if (!cred || cred.type !== EMachineCredentialType.KEYCLOAK_CLIENT) {
      throw new UnauthorizedException(
        'Machine client is not registered to an installation',
      );
    }
    return this.principal(cred);
  }

  private async principal(
    cred: MachineCredential & { installation: Installation },
  ): Promise<MachinePrincipal> {
    if (!cred.active || cred.revokedAt || !cred.installation.active) {
      throw new UnauthorizedException('Machine credentials revoked');
    }
    // Throttled so a device posting every few seconds doesn't write on every request.
    if (
      !cred.lastUsedAt ||
      Date.now() - cred.lastUsedAt.getTime() > 5 * 60_000
    ) {
      this.prisma.machineCredential
        .update({ where: { id: cred.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
    }
    return {
      credentialId: cred.id,
      clientId: cred.clientId,
      type: cred.type,
      installationId: cred.installation.id,
      siteId: cred.installation.siteId,
      externalSystemId: cred.installation.externalSystemId,
    };
  }
}
