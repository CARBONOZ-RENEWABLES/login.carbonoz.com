import { Injectable, NotFoundException } from '@nestjs/common';
import { ECustomerRole, ERole, Site, User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export const isObjectId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

/**
 * The single place that decides which sites a user may see. Access comes from
 * CustomerMember rows, never from ids the browser sends.
 */
@Injectable()
export class TenancyService {
  constructor(private readonly prisma: PrismaService) {}

  async customerIdsFor(user: User): Promise<string[]> {
    const rows = await this.prisma.customerMember.findMany({
      where: { userId: user.id },
      select: { customerId: true },
    });
    return rows.map((r) => r.customerId);
  }

  async sitesFor(user: User) {
    // The legacy bearer strategy doesn't check activeStatus, so it is checked here.
    if (user.activeStatus === false) return [];
    const where =
      user.role === ERole.ADMIN
        ? {}
        : { customerId: { in: await this.customerIdsFor(user) } };
    return this.prisma.site.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        customer: { select: { id: true, name: true, type: true } },
        installations: {
          select: {
            id: true,
            name: true,
            kind: true,
            active: true,
            lastSeenAt: true,
          },
        },
      },
    });
  }

  /** 404 (not 403) for sites the user can't see, so site ids can't be probed. */
  async assertSiteAccess(user: User, siteId: string): Promise<Site> {
    if (!user || user.activeStatus === false || !isObjectId(siteId))
      throw new NotFoundException('Site not found');
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');
    if (user.role === ERole.ADMIN) return site;
    const member = await this.prisma.customerMember.findUnique({
      where: {
        customerId_userId: { customerId: site.customerId, userId: user.id },
      },
    });
    if (!member) throw new NotFoundException('Site not found');
    return site;
  }

  async membershipsFor(user: User) {
    return this.prisma.customerMember.findMany({
      where: { userId: user.id },
      include: { customer: true },
    });
  }

  /** Every user may own at most one INDIVIDUAL customer, created on demand. */
  async ensurePersonalCustomer(userId: string, name?: string) {
    const existing = await this.prisma.customerMember.findFirst({
      where: {
        userId,
        role: ECustomerRole.OWNER,
        customer: { type: 'INDIVIDUAL' },
      },
      include: { customer: true },
    });
    if (existing) return existing.customer;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.customer.create({
      data: {
        name: name || user.email || 'Customer',
        type: 'INDIVIDUAL',
        members: { create: { userId, role: ECustomerRole.OWNER } },
      },
    });
  }
}
