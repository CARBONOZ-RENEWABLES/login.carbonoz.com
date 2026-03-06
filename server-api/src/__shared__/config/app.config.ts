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
  app.enableCors();
  // corsConfig()
  configureSwagger(app);
  const configService = app.get(ConfigService<IAppConfig>);
  if (configService.get('swaggerEnabled')) {
    configureSwagger(app);
  }
}
