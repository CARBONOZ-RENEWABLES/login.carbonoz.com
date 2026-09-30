import { Global, Module } from '@nestjs/common';
import { SiteAccessGuard } from './site-access.guard';
import { AdminTenancyController, SitesController } from './tenancy.controller';
import { TenancyService } from './tenancy.service';

@Global()
@Module({
  controllers: [SitesController, AdminTenancyController],
  providers: [TenancyService, SiteAccessGuard],
  exports: [TenancyService, SiteAccessGuard],
})
export class TenancyModule {}
