import { ConflictException } from '@nestjs/common';
import { ERole, User } from '@prisma/client';
import { findUsersByEmail, normalizeEmail } from 'src/__shared__/utils/email';
import { PrismaService } from 'src/prisma/prisma.service';

/** People sign in with Keycloak (KEYCLOAK_ENABLED): accounts are created there, not here. */
export const ssoEnabled = () => process.env.KEYCLOAK_ENABLED === 'true';

/**
 * With SSO the person is created in Keycloak (Users → Add user, e-mail
 * verified). To give them a customer before their first sign-in, a local
 * account without a password is prepared here; their first Keycloak sign-in
 * links to it by the verified e-mail (IdentityService). It cannot be used to
 * log in by password. Existing accounts are returned unchanged.
 */
export async function prepareSsoUser(
  prisma: PrismaService,
  email: string,
): Promise<{ user: User; created: boolean }> {
  const normalized = normalizeEmail(email);
  const existing = await findUsersByEmail(prisma, normalized);
  if (existing.length > 1)
    throw new ConflictException('Several accounts use this e-mail');
  if (existing.length) return { user: existing[0], created: false };
  const user = await prisma.user.create({
    data: { email: normalized, role: ERole.USER },
  });
  return { user, created: true };
}
