import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (!user.activeStatus) {
      throw new ForbiddenException('Account is inactive');
    }

    const now = new Date();
    
    // Check manual access with expiry validation
    if (user.manualAccessOverride) {
      if (!user.manualAccessExpiry || user.manualAccessExpiry > now) {
        return true;
      }
    }

    const activeSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        endDate: { gt: now },
      },
    });

    if (!activeSubscription) {
      throw new ForbiddenException('Active subscription required to access this feature');
    }

    return true;
  }
}
