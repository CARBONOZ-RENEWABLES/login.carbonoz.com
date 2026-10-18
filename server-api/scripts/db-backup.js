/* eslint-disable */
/**
 * Backup of the application database before a deployment, and proof that the
 * backup restores. Uses DATABASE_URL (environment or server-api/.env); the
 * URL and its password are never printed: every line from mongodump /
 * mongorestore is masked.
 *
 *   node scripts/db-backup.js dump                    # → ~/backups/<db>-<timestamp>/
 *   node scripts/db-backup.js verify <backup-folder>  # restore into <db>_restoretest, compare counts, drop it
 *
 * `verify` writes ONLY to a scratch database whose name ends in `_restoretest`
 * (refuses anything else) and drops it afterwards. The account needs write
 * access there (a least-privilege app user may not have it: then run verify
 * with an admin account's DATABASE_URL).
 *
 * Requires mongodump/mongorestore (MongoDB Database Tools). Exit code ≠ 0 on
 * any failure.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawnSync } = require('child_process');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* environment only */
}

const mask = (s) =>
  String(s).replace(/(mongodb(?:\+srv)?:\/\/)[^@/\s]*@/g, '$1***@');
const fail = (msg) => {
  console.error(mask(msg));
  process.exit(1);
};

function target() {
  const raw = process.env.DATABASE_URL;
  if (!raw) fail('DATABASE_URL is not set');
  let u;
  try {
    u = new URL(raw);
  } catch {
    fail('DATABASE_URL is not a valid URL (not shown)');
  }
  const db = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!db) fail('DATABASE_URL names no database');
  // Plain names only: the name goes into mongorestore's --nsInclude/--nsFrom/
  // --nsTo patterns, where `*` or `.` would widen the match.
  if (!/^[A-Za-z0-9_-]+$/.test(db))
    fail(
      'database name has characters this script does not handle (not shown)',
    );
  // mongorestore needs a URI without the database path (with it, it treats the
  // folder as a single-database dump and silently restores nothing).
  const root = new URL(raw);
  root.pathname = '/';
  if (root.username && !root.searchParams.has('authSource'))
    root.searchParams.set('authSource', db);
  return { uri: raw, rootUri: root.toString(), db, host: u.host };
}

function tool(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error) fail(`${cmd}: ${r.error.message}`);
  const out = mask(`${r.stdout}${r.stderr}`).trim();
  return { status: r.status, out };
}

/** Per collection: documents mongorestore reports as restored (its log lines). */
function countsFromRestoreLog(out) {
  const counts = {};
  for (const m of out.matchAll(
    /finished restoring (\S+?)\.(\S+) \((\d+) documents?, (\d+) failures?\)/g,
  ))
    counts[m[2]] = { docs: Number(m[3]), failures: Number(m[4]) };
  return counts;
}

function bsonCount(file) {
  // A BSON file is a sequence of documents, each starting with its int32 length.
  const buf = fs.readFileSync(file);
  let n = 0;
  for (let off = 0; off + 4 <= buf.length; n++) {
    const len = buf.readInt32LE(off);
    if (len <= 0) break;
    off += len;
  }
  return n;
}

/** Document count per collection in the live database (read-only). */
async function liveCounts(uri) {
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient({ datasources: { db: { url: uri } } });
  try {
    const r = await p.$runCommandRaw({
      listCollections: 1,
      nameOnly: true,
      cursor: {},
    });
    const out = {};
    for (const { name } of r.cursor.firstBatch) {
      if (name.startsWith('system.')) continue;
      out[name] = (await p.$runCommandRaw({ count: name })).n;
    }
    return out;
  } finally {
    await p.$disconnect();
  }
}

async function dropScratch(rootUri, scratch) {
  if (!scratch.endsWith('_restoretest')) return; // never anything else
  const u = new URL(rootUri);
  u.pathname = `/${scratch}`;
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient({ datasources: { db: { url: u.toString() } } });
  try {
    await p.$runCommandRaw({ dropDatabase: 1 });
    console.log(`scratch database "${scratch}" dropped`);
  } catch (e) {
    console.log(
      mask(
        `note: drop "${scratch}" by hand (${String(e.message)
          .split('\n')
          .pop()})`,
      ),
    );
  } finally {
    await p.$disconnect();
  }
}

async function main() {
  const [, , mode, folder] = process.argv;
  const t = target();

  if (mode === 'dump') {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const out = path.join(os.homedir(), 'backups', `${t.db}-${stamp}`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    console.log(`dumping database "${t.db}" on ${t.host} → ${out}`);
    const r = tool('mongodump', [`--uri=${t.uri}`, `--out=${out}`]);
    if (r.status !== 0) fail(`mongodump failed:\n${r.out}`);
    const dir = path.join(out, t.db);
    const dumped = Object.fromEntries(
      fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.bson'))
        .map((f) => [f.replace(/\.bson$/, ''), bsonCount(path.join(dir, f))]),
    );
    // Live counts right after the dump (run during the maintenance window, when nothing writes).
    const live = await liveCounts(t.uri);
    fs.writeFileSync(
      path.join(out, 'manifest.json'),
      JSON.stringify(
        { db: t.db, host: t.host, at: new Date().toISOString(), live, dumped },
        null,
        2,
      ),
    );
    const differ = Object.keys(live).filter(
      (c) => live[c] !== (dumped[c] ?? 0),
    );
    const docs = Object.values(dumped).reduce((a, b) => a + b, 0);
    if (differ.length)
      fail(
        `dump differs from the live database (writes during the dump?): ${differ
          .map((c) => `${c} ${dumped[c] ?? 0}/${live[c]}`)
          .join(', ')}`,
      );
    console.log(
      `ok: ${
        Object.keys(dumped).length
      } collections, ${docs} documents in ${out} (matches the live database)`,
    );
    console.log(`next: node scripts/db-backup.js verify ${out}`);
    return;
  }

  if (mode === 'verify') {
    if (!folder || !fs.existsSync(path.join(folder, t.db)))
      fail(
        `usage: node scripts/db-backup.js verify <backup-folder> (must contain ./${t.db}/)`,
      );
    const scratch = `${t.db}_restoretest`;
    if (scratch === t.db || !scratch.endsWith('_restoretest'))
      fail('refusing: the scratch database must differ from the real one');
    const dir = path.join(folder, t.db);
    const files = Object.fromEntries(
      fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.bson'))
        .map((f) => [f.replace(/\.bson$/, ''), bsonCount(path.join(dir, f))]),
    );
    const manifestFile = path.join(folder, 'manifest.json');
    const manifest = fs.existsSync(manifestFile)
      ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
      : null;
    if (!manifest)
      console.log(
        'note: no manifest.json — comparing with the backup files only',
      );
    // What must come back: the live counts taken at dump time (else the files).
    const expected = manifest ? manifest.live : files;
    console.log(
      `restoring ${folder} into scratch database "${scratch}" on ${t.host}`,
    );
    // Proof the real database is untouched: its counts before and after (read-only).
    const before = await liveCounts(t.uri);
    const r = tool('mongorestore', [
      `--uri=${t.rootUri}`,
      `--dir=${folder}`,
      `--nsInclude=${t.db}.*`,
      `--nsFrom=${t.db}.*`,
      `--nsTo=${scratch}.*`,
      '--drop', // only ever the scratch database (nsTo above)
    ]);
    const got = countsFromRestoreLog(r.out);
    await dropScratch(t.rootUri, scratch);
    const after = await liveCounts(t.uri);
    const changed = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ]
      .filter((c) => before[c] !== after[c])
      .map((c) => `${c} ${before[c] ?? '-'}→${after[c] ?? '-'}`);
    if (changed.length)
      fail(
        `the real database "${
          t.db
        }" changed during verify (is something else writing?): ${changed.join(
          ', ',
        )}`,
      );
    console.log(
      `real database "${t.db}" unchanged (document counts before = after)`,
    );
    if (r.status !== 0) fail(`mongorestore failed:\n${r.out}`);
    const problems = [];
    for (const [c, n] of Object.entries(expected)) {
      const g =
        got[c] ?? (n === 0 && files[c] === 0 ? { docs: 0, failures: 0 } : null);
      if (!g) problems.push(`${c}: not restored`);
      else if (g.docs !== n || g.failures)
        problems.push(
          `${c}: ${g.docs}/${n} documents restored, ${g.failures} failures`,
        );
    }
    if (problems.length)
      fail(`restore verification FAILED:\n  ${problems.join('\n  ')}`);
    const total = Object.values(expected).reduce((a, b) => a + b, 0);
    console.log(
      `ok: ${
        Object.keys(expected).length
      } collections, ${total} documents restored, matching ${
        manifest ? 'the live database at backup time' : 'the backup files'
      }`,
    );
    return;
  }

  fail('usage: node scripts/db-backup.js dump | verify <backup-folder>');
}

main().catch((e) => fail(`failed: ${e.message}`));
