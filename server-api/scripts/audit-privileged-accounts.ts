/**
 * READ-ONLY audit of privileged Carbonoz accounts, to run against the
 * production database before the Keycloak cut-over.
 *
 * Why: public sign-up used to accept `role: "ADMIN"` (fixed), so ADMIN or
 * SUB_ADMIN accounts may exist that no administrator created. There is no log
 * of sign-ups, so each privileged account has to be reviewed by a person.
 * This script lists them with the facts needed for that review; it never
 * changes or deletes anything.
 *
 *   DATABASE_URL=... ADMIN_EMAIL=... npm run audit:admins            # table
 *   DATABASE_URL=... ADMIN_EMAIL=... npm run audit:admins -- --json  # JSON
 */
import { PrismaClient } from '@prisma/client';

interface Row {
  id: string;
  email: string | null;
  role: string;
  createdAt: string;
  active: boolean;
  activeStatus: boolean;
  hasPassword: boolean;
  seededAdmin: boolean;
  ssoLinks: number;
  lastActivity: string | null;
  review: string;
}

async function main() {
  const prisma = new PrismaClient();
  const seeded = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUB_ADMIN'] } },
      orderBy: { createdAt: 'asc' },
      include: { UserIdentity: { select: { id: true } } },
    });
    const rows: Row[] = [];
    for (const u of users) {
      const last = await prisma.logs.findFirst({
        where: { userId: u.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const isSeeded = !!seeded && (u.email ?? '').toLowerCase() === seeded;
      rows.push({
        id: u.id,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
        active: u.active,
        activeStatus: u.activeStatus,
        hasPassword: !!u.password,
        seededAdmin: isSeeded,
        ssoLinks: u.UserIdentity.length,
        lastActivity: last?.createdAt.toISOString() ?? null,
        review: isSeeded
          ? 'seeded admin (ADMIN_EMAIL) — confirm it is still needed'
          : 'NOT the seeded admin — confirm who created it; demote/disable manually if unknown',
      });
    }

    // Addresses that differ only by letter case: SSO linking refuses them
    // (email_ambiguous), so they must be merged or renamed before cut-over.
    const all = (await prisma.user.findMany({ select: { id: true, email: true, role: true } })).filter((u) => u.email);
    const byLower = new Map<string, typeof all>();
    for (const u of all) {
      const k = u.email.trim().toLowerCase();
      byLower.set(k, [...(byLower.get(k) ?? []), u]);
    }
    const caseDuplicates = [...byLower.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([email, list]) => ({ email, accounts: list.map((u) => ({ id: u.id, email: u.email, role: u.role })) }));

    const report = {
      generatedAt: new Date().toISOString(),
      seededAdminEmail: seeded || null,
      privilegedAccounts: rows,
      needsReview: rows.filter((r) => !r.seededAdmin).length,
      caseDuplicateEmails: caseDuplicates,
    };

    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`Privileged accounts: ${rows.length} (needs review: ${report.needsReview})`);
    console.table(
      rows.map((r) => ({
        email: r.email,
        role: r.role,
        created: r.createdAt.slice(0, 10),
        enabled: r.activeStatus,
        password: r.hasPassword,
        sso: r.ssoLinks,
        lastActivity: r.lastActivity?.slice(0, 10) ?? '—',
        review: r.review,
      })),
    );
    console.log(`Email addresses that differ only by case: ${caseDuplicates.length}`);
    for (const d of caseDuplicates) console.log(`  ${d.email}: ${d.accounts.map((a) => `${a.email} (${a.role})`).join(', ')}`);
    if (!seeded) console.log('Note: ADMIN_EMAIL not set — the seeded admin could not be identified.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
