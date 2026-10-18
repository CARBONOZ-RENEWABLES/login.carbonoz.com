/* eslint-disable */
/**
 * Deliberate Keycloak link for an existing account — the path for ADMIN and
 * SUB_ADMIN accounts, which are never linked automatically by email.
 *
 *   node scripts/link-identity.js --email admin@example.com --subject <keycloak user id>
 *   node scripts/link-identity.js ... --apply      # without --apply: dry run, changes nothing
 *
 * The subject is the Keycloak user's ID (Admin console → Users → the user →
 * ID), checked by the Keycloak administrator to belong to that person. The
 * provider is derived from KEYCLOAK_ISSUER_URL as the API does
 * ("keycloak:<realm>"). User.id is never changed. Refuses when the email
 * matches no or several accounts, or the subject is already linked to another
 * account. DATABASE_URL and KEYCLOAK_ISSUER_URL come from the environment or
 * server-api/.env; nothing secret is printed.
 */
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* environment only */
}
const { PrismaClient } = require('@prisma/client');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const fail = (msg, code = 1) => {
  console.error(msg);
  process.exit(code);
};

(async () => {
  const email = (arg('email') || '').trim().toLowerCase();
  const subject = (arg('subject') || '').trim();
  const apply = process.argv.includes('--apply');
  if (!email || !subject)
    fail(
      'usage: node scripts/link-identity.js --email <email> --subject <keycloak user id> [--apply]',
      2,
    );
  const realm = (process.env.KEYCLOAK_ISSUER_URL || '')
    .split('/realms/')[1]
    ?.replace(/\/+$/, '');
  if (!realm)
    fail('KEYCLOAK_ISSUER_URL is not set (needed for the provider key)');
  const provider = `keycloak:${realm}`;

  const prisma = new PrismaClient();
  try {
    const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await prisma.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, role: true },
    });
    const matches = users.filter((u) =>
      new RegExp(`^${escaped}$`, 'i').test(u.email || ''),
    );
    if (matches.length !== 1)
      fail(`refusing: ${matches.length} accounts match this email`);
    const user = matches[0];
    const existing = await prisma.userIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
    });
    if (existing && existing.userId !== user.id)
      fail(
        'refusing: this Keycloak subject is already linked to another account',
      );
    if (existing) {
      console.log(
        `already linked: user ${user.id} (${user.role}) ↔ ${provider}`,
      );
      return;
    }
    console.log(
      `${apply ? 'linking' : 'would link (dry run)'}: user ${user.id} (${
        user.role
      }) ↔ ${provider} subject ${subject}`,
    );
    if (!apply) return;
    await prisma.userIdentity.create({
      data: { provider, subject, email, userId: user.id },
    });
    console.log('linked');
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => fail(`failed: ${String(e.message).split('\n').pop()}`));
