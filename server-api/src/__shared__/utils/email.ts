import { User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

/** Canonical form stored for new accounts: trimmed and lower-cased. */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

/** Escapes every regex metacharacter so user input is matched literally. */
export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/**
 * Case-insensitive EXACT email lookup.
 *
 * Prisma's `equals` + `mode: 'insensitive'` on MongoDB is an unescaped
 * regex, so an address such as `x*|a@evil.example` matched every user. This
 * builds the anchored regex itself from an escaped value, so `+ * . |` in
 * legitimate addresses (a+b@example.com) are literal characters.
 *
 * Returns all matches: legacy accounts may differ only by letter case, and
 * callers decide how to treat that ambiguity.
 */
export async function findUsersByEmail(
  prisma: PrismaService,
  email: string,
): Promise<User[]> {
  const value = email?.trim();
  if (!value) return [];
  const docs = (await prisma.user.findRaw({
    filter: { email: { $regex: `^${escapeRegex(value)}$`, $options: 'i' } },
    options: { projection: { _id: 1 }, limit: 10 },
  })) as unknown as Array<{ _id: { $oid: string } | string }>;
  const ids = docs.map((d) =>
    typeof d._id === 'object' ? d._id.$oid : String(d._id),
  );
  if (!ids.length) return [];
  return prisma.user.findMany({ where: { id: { in: ids } } });
}

/** The single account for an email, or null when there is none or it is ambiguous. */
export async function findUserByEmail(
  prisma: PrismaService,
  email: string,
): Promise<User | null> {
  const users = await findUsersByEmail(prisma, email);
  if (users.length <= 1) return users[0] ?? null;
  // Prefer the account whose stored address is exactly the given one.
  return users.find((u) => u.email === email.trim()) ?? null;
}
