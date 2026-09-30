import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Site } from '@prisma/client';
import { TenancyService } from './tenancy.service';

/**
 * Runs after JwtGuard on any route with a `:siteId` param and attaches the
 * authorised site to the request. Handlers read it with @CurrentSite().
 */
@Injectable()
export class SiteAccessGuard implements CanActivate {
  constructor(private readonly tenancy: TenancyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    req.site = await this.tenancy.assertSiteAccess(
      req.user,
      req.params?.siteId,
    );
    return true;
  }
}

export const CurrentSite = createParamDecorator(
  (_data, ctx: ExecutionContext): Site => ctx.switchToHttp().getRequest().site,
);
