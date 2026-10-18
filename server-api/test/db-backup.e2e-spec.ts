/**
 * scripts/db-backup.js against the disposable test MongoDB: `verify` restores
 * only into `<db>_restoretest` and never writes the real database (proved
 * with MongoDB's dbHash before and after), nor any other database that
 * happens to be in the backup folder.
 */
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { MongoClient } from 'mongodb';
import { tmpdir } from 'os';
import { join } from 'path';
import { readState } from './support/stack';

const SCRIPT =
  process.env.DB_BACKUP_SCRIPT ??
  join(__dirname, '..', 'scripts', 'db-backup.js');
const hasTools =
  spawnSync('mongodump', ['--version']).status === 0 &&
  spawnSync('mongorestore', ['--version']).status === 0;

const tag = randomBytes(4).toString('hex');
const withDb = (url: string, db: string) =>
  url.replace(/\/([^/?]*)(\?|$)/, `/${db}$2`);

(hasTools ? describe : describe.skip)('scripts/db-backup.js', () => {
  const base = readState().databaseUrl;
  const real = `bk_${tag}`;
  const other = `bkother_${tag}`;
  const home = mkdtempSync(join(tmpdir(), 'db-backup-home-'));
  let client: MongoClient;

  const run = (args: string[], url = withDb(base, real)) =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, DATABASE_URL: url, HOME: home },
      encoding: 'utf8',
    });
  const dbHash = async (db: string) =>
    (await client.db(db).command({ dbHash: 1 })).md5 as string;
  const dbNames = async () =>
    (await client.db().admin().listDatabases()).databases.map((d) => d.name);

  beforeAll(async () => {
    client = await MongoClient.connect(base);
    await client
      .db(real)
      .collection('User')
      .insertMany([{ n: 1 }, { n: 2 }, { n: 3 }]);
    await client
      .db(real)
      .collection('Payment')
      .insertMany([{ p: 1 }, { p: 2 }]);
    await client.db(real).createCollection('Empty');
    await client.db(other).collection('X').insertOne({ x: 1 });
  });
  afterAll(async () => {
    for (const db of [real, other, `${real}_restoretest`])
      await client.db(db).dropDatabase();
    await client.close();
    rmSync(home, { recursive: true, force: true });
  });

  it('verify restores into <db>_restoretest only; the real database and others are untouched', async () => {
    const dump = run(['dump']);
    expect([dump.status, dump.stderr]).toEqual([0, '']);
    expect(dump.stdout).toMatch(/ok: 3 collections, 5 documents/);
    const folder = join(home, 'backups', readdirSync(join(home, 'backups'))[0]);

    // A second database in the same backup folder must not be restored.
    const extra = spawnSync('mongodump', [
      `--uri=${withDb(base, other)}`,
      `--out=${folder}`,
    ]);
    expect(extra.status).toBe(0);

    // Data written after the backup: a restore that reached the real database
    // (instead of the scratch copy) would drop it, changing the hash below.
    await client.db(real).collection('User').insertOne({ n: 'after-backup' });
    await client.db(other).collection('X').insertOne({ x: 'after-backup' });

    const before = { real: await dbHash(real), other: await dbHash(other) };
    const verify = run(['verify', folder]);
    expect([verify.status, verify.stderr]).toEqual([0, '']);
    expect(verify.stdout).toMatch(
      new RegExp(`into scratch database "${real}_restoretest"`),
    );
    expect(verify.stdout).toMatch(/real database ".*" unchanged/);
    expect(verify.stdout).toMatch(/ok: 3 collections, 5 documents restored/);
    expect(verify.stdout).not.toMatch(/mongodb:\/\//);

    expect({ real: await dbHash(real), other: await dbHash(other) }).toEqual(
      before,
    );
    const names = await dbNames();
    expect(names).not.toContain(`${real}_restoretest`); // dropped afterwards
    expect(names).not.toContain(`${other}_restoretest`); // never restored
    expect(
      await client
        .db(real)
        .collection('User')
        .countDocuments({ n: 'after-backup' }),
    ).toBe(1);
  });

  it('refuses database names that would widen the restore patterns', () => {
    for (const bad of ['bk*', 'a.b']) {
      const r = run(['verify', home], withDb(base, encodeURIComponent(bad)));
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/characters this script does not handle/);
      expect(`${r.stdout}${r.stderr}`).not.toMatch(/mongodb:\/\//);
    }
  });
});
