import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IAppConfig } from '../interfaces';

export function appConfig(): IAppConfig {
  return {
    port: +process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',
    env: process.env.NODE_ENV,
    jwt: {
      secret: process.env.JWT_SECRET,
    },
    redex: {
      url: process.env.REDEX_API_URL,
      apiKey: process.env.REDEX_API_KEY,
      clientId: process.env.REDEX_CLIENT_ID,
      clientSecret: process.env.REDEX_CLIENT_SECRET,
    },
    frontedUrl: process.env.FRONTED_URL,
    backendUrl: process.env.BACKEND_URL || 'http://192.168.160.190:3000/api/v1',
    admin: {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    },
    smtp: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? +process.env.SMTP_PORT : undefined,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    appleClientId: process.env.APPLE_CLIENT_ID,
    appleTeamId: process.env.APPLE_TEAM_ID,
    appleKeyId: process.env.APPLE_KEY_ID,
    applePrivateKey: process.env.APPLE_PRIVATE_KEY,
    // false → password sign-in/sign-up and legacy bearer JWTs are rejected (Keycloak only).
    legacyAuthEnabled: process.env.LEGACY_AUTH_ENABLED !== 'false',
    keycloak: {
      enabled: process.env.KEYCLOAK_ENABLED === 'true',
      issuerUrl: process.env.KEYCLOAK_ISSUER_URL,
      clientId: process.env.KEYCLOAK_CLIENT_ID,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
      redirectUri: process.env.KEYCLOAK_REDIRECT_URI,
      postLogoutRedirectUri:
        process.env.KEYCLOAK_POST_LOGOUT_REDIRECT_URI ||
        process.env.FRONTED_URL,
      scopes: process.env.KEYCLOAK_SCOPES || 'openid email profile',
      linkByEmail: process.env.KEYCLOAK_LINK_BY_EMAIL !== 'false',
      returnOrigins: [
        process.env.FRONTED_URL,
        ...(process.env.AUTH_RETURN_ORIGINS || '').split(','),
      ]
        .map((o) => {
          try {
            return new URL(o.trim()).origin;
          } catch {
            return null;
          }
        })
        .filter(Boolean),
    },
    session: {
      cookieName: process.env.SESSION_COOKIE_NAME || 'cz_session',
      cookieDomain: process.env.SESSION_COOKIE_DOMAIN || undefined,
      cookieSecure: process.env.SESSION_COOKIE_SECURE
        ? process.env.SESSION_COOKIE_SECURE === 'true'
        : process.env.NODE_ENV !== 'development',
      idleTtlSeconds: +(process.env.SESSION_IDLE_TTL_SECONDS || 8 * 3600),
      absoluteTtlSeconds: +(
        process.env.SESSION_ABSOLUTE_TTL_SECONDS || 7 * 24 * 3600
      ),
    },
    machineAuth: {
      keycloakIssuerUrl: process.env.MACHINE_KEYCLOAK_ISSUER_URL,
      keycloakAudience: process.env.MACHINE_KEYCLOAK_AUDIENCE,
      requiredRole: process.env.MACHINE_REQUIRED_ROLE || 'solarbms-ingest',
      apiKeysEnabled: process.env.MACHINE_API_KEYS_ENABLED !== 'false',
    },
    solar: {
      workerEnabled: process.env.SOLAR_WORKER_ENABLED !== 'false',
      streamKey: process.env.SOLAR_STREAM_KEY || 'solar:ingest',
      streamMaxLen: +(process.env.SOLAR_STREAM_MAXLEN || 100000),
      liveTtlSeconds: +(process.env.SOLAR_LIVE_TTL_SECONDS || 900),
      reclaimIdleMs: +(process.env.SOLAR_RECLAIM_IDLE_MS || 60_000),
      maxDeliveries: +(process.env.SOLAR_MAX_DELIVERIES || 5),
    },
  };
}

export function configureSwagger(app: INestApplication): void {
  const API_TITLE = 'Carbonoz';
  const API_DESCRIPTION = 'API Doc. for Carbonoz API';
  const API_VERSION = '1.0';
  const SWAGGER_URL = '/swagger';
  const options = new DocumentBuilder()
    .setTitle(API_TITLE)
    .setDescription(API_DESCRIPTION)
    .setVersion(API_VERSION)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup(SWAGGER_URL, app, document, {
    customSiteTitle: 'Carbonoz API',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      docExpansion: 'none',
      persistAuthorization: true,
      apisSorter: 'alpha',
      operationsSorter: 'method',
      tagsSorter: 'alpha',
    },
  });
}

export function configure(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  // Any origin may call with a bearer token (legacy JWT, machine credential),
  // but never with credentials: the session cookie only works same-origin
  // (the SPA reaches /api through Nginx). Do not enable `credentials` here.
  app.enableCors({ origin: '*', credentials: false });
  // Swagger publishes the whole API surface: only when explicitly enabled
  // (SWAGGER_ENABLED=true), never by default and never in production.
  const configService = app.get(ConfigService<IAppConfig>);
  if (configService.get('swaggerEnabled')) {
    configureSwagger(app);
  }
}
