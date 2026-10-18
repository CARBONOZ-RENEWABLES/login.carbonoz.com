/* eslint-disable */
/**
 * Error-log records written before redaction (logs.service) may contain
 * submitted passwords, tokens or secrets in `metadata` (the request body) and
 * `requestUrl` (query string).
 *
 *   node scripts/logs-credential-audit.js check            # READ-ONLY: counts, never contents
 *   node scripts/logs-credential-audit.js redact           # dry run: what would change
 *   node scripts/logs-credential-audit.js redact --apply   # rewrite those fields redacted
 *
 * `redact --apply` modifies production data: only with the data owner's
 * approval and after a verified backup (docs/deployment-runbook.md §2).
 * It rewrites `metadata` and `requestUrl` of the matching records through the
 * same redaction the API now uses (from dist/, else from source via ts-node);
 * nothing is deleted. Nothing sensitive is printed.
 */
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* environment only */
}
const { PrismaClient } = require('@prisma/client');

// A sensitive field name followed by a value that is not already redacted.
const SUSPECT =
  '(pass(word|wd)?|pwd|secret|token|api[-_]?key|authori[sz]ation|cookie|credential|private[-_]?key|code)"?\\s*[:=]\\s*"?(?!\\[REDACTED\\])[^"\\s,}&]';

(async () => {
  const [mode] = process.argv.slice(2);
  const apply = process.argv.includes('--apply');
  if (mode !== 'check' && mode !== 'redact') {
    console.error(
      'usage: node scripts/logs-credential-audit.js check | redact [--apply]',
    );
    process.exit(2);
  }
  const prisma = new PrismaClient();
  try {
    const where = {
      OR: [
        { metadata: { contains: '"body":' } },
        { requestUrl: { contains: '?' } },
      ],
    };
    const total = await prisma.logs.count();
    const candidates = await prisma.logs.findMany({
      where,
      select: { id: true, metadata: true, requestUrl: true, createdAt: true },
    });
    const re = new RegExp(SUSPECT, 'i');
    const hits = candidates.filter(
      (l) => re.test(l.metadata || '') || re.test(l.requestUrl || ''),
    );
    const dates = hits.map((h) => h.createdAt.getTime()).sort((a, b) => a - b);
    console.log(`log records: ${total}`);
    console.log(`records that may contain credentials: ${hits.length}`);
    if (hits.length)
      console.log(
        `  oldest ${new Date(dates[0]).toISOString()}, newest ${new Date(
          dates[dates.length - 1],
        ).toISOString()}`,
      );
    if (mode === 'check' || !hits.length) return;

    // The API's own redaction: from the build, else straight from source.
    let redact;
    try {
      redact = require('../dist/src/__shared__/utils/redact');
      if (!redact.safeJson) throw new Error('old build');
    } catch {
      require('ts-node').register({ transpileOnly: true });
      redact = require('../src/__shared__/utils/redact');
    }
    const fix = (l) => {
      let metadata = l.metadata;
      try {
        metadata = redact.safeJson(JSON.parse(l.metadata), 8000, {
          maxString: 4000,
        });
      } catch {
        metadata = redact.redactText(l.metadata || '', 8000);
      }
      return { metadata, requestUrl: redact.redactUrl(l.requestUrl || '') };
    };
    const still = hits.filter((l) => {
      const f = fix(l);
      return re.test(f.metadata || '') || re.test(f.requestUrl || '');
    }).length;
    console.log(
      `${apply ? 'redacting' : 'would redact (dry run)'}: ${
        hits.length
      } records; still suspect afterwards: ${still}`,
    );
    if (!apply) return;
    let n = 0;
    for (const l of hits) {
      await prisma.logs.update({ where: { id: l.id }, data: fix(l) });
      n++;
    }
    console.log(`redacted ${n} records`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(`failed: ${String(e.message).split('\n').pop()}`);
  process.exit(1);
});
