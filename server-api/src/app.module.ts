import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { appConfig } from './__shared__/config/app.config';
import { GlobalExceptionFilter } from './__shared__/filters/global-exception.filter';
import { LoggingInterceptor } from './__shared__/interceptors';
import { AdminModule } from './admin/admin.module';
import { AssetModule } from './asset/asset.module';
import { AuthModule } from './auth/auth.module';
import { CertificationModule } from './certification/certification.module';
import { EventModule } from './event/event.module';
import { InformationModule } from './information/information.module';
import { LogsModule } from './logsM/logs.module';
import { MailsModule } from './mails/mails.module';
import { MeterModule } from './meter/meter.module';
import { PartnersModule } from './partners/partners.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectModule } from './project/project.module';
import { RedexModule } from './redex/redex.module';
import { SeedData } from './seeder';
import { StepsModule } from './steps/steps.module';
import { SystemstepsModule } from './systemsteps/systemsteps.module';
import { UserModule } from './user/user.module';
import { RedisModule } from './redis/redis.module';
import { MachineAuthModule } from './machine-auth/machine-auth.module';
import { SolarModule } from './solar/solar.module';
import { TenancyModule } from './tenancy/tenancy.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthModule,
    EventModule,
    AssetModule,
    InformationModule,
    UserModule,
    StepsModule,
    RedexModule,
    PartnersModule,
    SystemstepsModule,
    MeterModule,
    ProjectModule,
    CertificationModule,
    MailsModule,
    AdminModule,
    LogsModule,
    MachineAuthModule,
    TenancyModule,
    SolarModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    SeedData,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
