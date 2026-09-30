import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ERole, User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { OidcClaims } from './oidc.service';
import { findUsersByEmail, normalizeEmail } from 'src/__shared__/utils/email';

/**
 * Keycloak authenticates the person; Carbonoz keeps the User record and every
 * business record hanging off User.id. This maps a Keycloak subject onto that
 * User without changing its id.
 */
@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveUser(
    provider: string,
    claims: OidcClaims,
    linkByEmail: boolean,
  ): Promise<User> {
    const linked = await this.prisma.userIdentity.findUnique({
      where: { provider_subject: { provider, subject: claims.sub } },
      include: { user: true },
    });
    if (linked) {
      await this.prisma.userIdentity.update({
        where: { id: linked.id },
        data: { lastLoginAt: new Date(), email: claims.email ?? linked.email },
      });
      return this.assertUsable(linked.user);
    }

    const email = claims.email ? normalizeEmail(claims.email) : undefined;
    // Linking or creating by email is only safe when Keycloak verified it.
    if (!email || claims.email_verified !== true) {
      throw new ForbiddenException('email_unverified');
    }

    let user: User | null = null;
    if (linkByEmail) {
      // Exact (escaped) match. Several legacy accounts differing only by case
      // are ambiguous: refuse rather than guess which one to take over.
      const matches = await findUsersByEmail(this.prisma, email);
      if (matches.length > 1) {
        this.logger.warn(
          `SSO login for ${provider} subject ${claims.sub}: ${matches.length} accounts match the email`,
        );
        throw new ForbiddenException('email_ambiguous');
      }
      user = matches[0] ?? null;
    }
    if (!user) {
      user = await this.prisma.user.create({
        // No password: this account signs in through Keycloak only.
        data: { email, active: true, role: ERole.USER },
      });
      this.logger.log(
        `Created Carbonoz user ${user.id} for ${provider} subject ${claims.sub}`,
      );
    } else {
      this.logger.log(
        `Linked existing user ${user.id} to ${provider} subject ${claims.sub}`,
      );
    }

    await this.prisma.userIdentity.create({
      data: { provider, subject: claims.sub, email, userId: user.id },
    });
    if (!user.active) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { active: true },
      });
    }
    return this.assertUsable(user);
  }

  private assertUsable(user: User): User {
    if (user.activeStatus === false)
      throw new ForbiddenException('account_disabled');
    return user;
  }
}
