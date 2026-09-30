/**
 * Boots the real Carbonoz API in-process against the test stack. Every
 * config value is set explicitly, so nothing leaks in from a local .env.
 * Jest gives each test file its own module registry, so each file gets a
 * fresh AppModule with its own environment.
 */
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { freePort, readState, StackState } from './stack';

export interface TestApi {
  app: INestApplication;
  api: string;
  port: number;
  st: StackState;
  close: () => Promise<void>;
}

export async function startApi(
  overrides: Record<string, string> = {},
): Promise<TestApi> {
  const st = readState();
  const port = await freePort();
  const env: Record<string, string> = {
    NODE_ENV: 'development',
    PORT: String(port),
    DATABASE_URL: st.databaseUrl,
    REDIS_URL: st.redisUrl,
    JWT_SECRET: 'e2e-jwt-secret',
    FRONTED_URL: 'http://frontend.test',
    ADMIN_EMAIL: 'admin@carbonoz.test',
    ADMIN_PASSWORD: 'Admin@123',
    SMTP_HOST: '',
    SMTP_USER: '',
    SWAGGER_ENABLED: 'false',
    SESSION_COOKIE_SECURE: 'false',
    SESSION_COOKIE_DOMAIN: '',
    KEYCLOAK_ENABLED: 'true',
    KEYCLOAK_ISSUER_URL: `${st.kcUrl}/realms/customers`,
    KEYCLOAK_CLIENT_ID: 'carbonoz-login',
    KEYCLOAK_CLIENT_SECRET: 'test-secret',
    KEYCLOAK_REDIRECT_URI: `http://127.0.0.1:${port}/api/v1/auth/oidc/callback`,
    KEYCLOAK_LINK_BY_EMAIL: 'true',
    AUTH_RETURN_ORIGINS: 'http://solar.test',
    MACHINE_KEYCLOAK_ISSUER_URL: `${st.kcUrl}/realms/machines`,
    MACHINE_KEYCLOAK_AUDIENCE: 'carbonoz-ingest',
    MACHINE_REQUIRED_ROLE: 'solarbms-ingest',
    MACHINE_API_KEYS_ENABLED: 'true',
    LEGACY_AUTH_ENABLED: 'true',
    SOLAR_WORKER_ENABLED: 'true',
    SOLAR_STREAM_KEY: 'solar:ingest',
    SOLAR_STREAM_MAXLEN: '100000',
    SOLAR_RECLAIM_IDLE_MS: '60000',
    SOLAR_MAX_DELIVERIES: '5',
    ...overrides,
  };
  Object.assign(process.env, env);
  // Imported after the environment is set: config is read at module init.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppModule } = require('../../src/app.module');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { configure } = require('../../src/__shared__/config/app.config');
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: process.env.E2E_VERBOSE ? ['error', 'warn', 'log'] : false,
  });
  configure(app);
  app.enableShutdownHooks();
  await app.listen(port, '127.0.0.1');
  return {
    app,
    api: `http://127.0.0.1:${port}/api/v1`,
    port,
    st,
    close: () => app.close(),
  };
}
