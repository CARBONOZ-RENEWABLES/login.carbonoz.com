/**
 * An installation's systemId routes SolarBMS data (machine credentials and
 * the Raspberry ingest bridge), so it must be unique: enforced by the admin
 * API and, at database level, by the partial unique index that
 * scripts/installation-system-id-index.js creates.
 */
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import { MongoClient } from 'mongodb';
import { join } from 'path';
import { readState } from './support/stack';
import { startApi, TestApi } from './support/app';
import { adminToken, call, db, provision, signup } from './support/http';

const tag = randomBytes(4).toString('hex');
const prisma = db();
let t: TestApi;
let admin: string;

beforeAll(async () => {
  t = await startApi();
  admin = await adminToken(t.api);
});
afterAll(async () => {
  await prisma.$disconnect();
  await t.close();
});

describe('admin API: systemId is unique', () => {
  it('rejects a second installation with the same systemId (create and update), trims, allows none', async () => {
    const owner = await signup(t.api, 'sysid');
    const p = await provision(t.api, admin, owner.user.id, {
      systemId: `pi-${tag}`,
    });
    const createIn = (siteId: string, body: Record<string, unknown>) =>
      call(t.api, 'POST', `/admin/sites/${siteId}/installations`, {
        token: admin,
        body: { name: 'Pi', ...body },
      });

    const dup = await createIn(p.site.id, { externalSystemId: `  pi-${tag} ` });
    expect(dup.status).toBe(409);
    expect(JSON.stringify(dup.data)).toMatch(
      /already used by another installation/,
    );

    // Installations without a systemId are fine, any number of them.
    expect((await createIn(p.site.id, {})).status).toBe(201);
    const blank = await createIn(p.site.id, { externalSystemId: '   ' });
    expect(blank.status).toBe(201);
    expect(blank.data.data.externalSystemId).toBeNull();

    // Update: taking another installation's systemId is refused; keeping one's own is fine.
    const other = await createIn(p.site.id, { externalSystemId: `pi2-${tag}` });
    expect(other.status).toBe(201);
    const steal = await call(
      t.api,
      'PATCH',
      `/admin/installations/${other.data.data.id}`,
      { token: admin, body: { externalSystemId: `pi-${tag}` } },
    );
    expect(steal.status).toBe(409);
    const keep = await call(
      t.api,
      'PATCH',
      `/admin/installations/${p.installation.id}`,
      {
        token: admin,
        body: { externalSystemId: ` pi-${tag}`, name: 'Renamed' },
      },
    );
    expect(keep.status).toBe(200);
    expect(keep.data.data.externalSystemId).toBe(`pi-${tag}`);
    const stored = await prisma.installation.findUnique({
      where: { id: other.data.data.id },
    });
    expect(stored?.externalSystemId).toBe(`pi2-${tag}`);
  });
});

describe('scripts/installation-system-id-index.js (database-level guard)', () => {
  // Its own database, so the index doesn't affect the other e2e tests.
  const url = readState().databaseUrl.replace(
    /\/([^/?]+)(\?|$)/,
    `/sysid_${tag}$2`,
  );
  const run = (mode: string, databaseUrl = url) =>
    spawnSync(
      process.execPath,
      [
        join(__dirname, '..', 'scripts', 'installation-system-id-index.js'),
        mode,
      ],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: 'utf8',
      },
    );

  it('check passes on a database without an Installation collection (first deployment: it runs before db push) and creates nothing', async () => {
    const fresh = url.replace(`sysid_${tag}`, `sysid_fresh_${tag}`);
    const check = run('check', fresh);
    expect([check.status, check.stderr]).toEqual([0, '']);
    expect(check.stdout).toMatch(/duplicate systemIds: 0/);
    const client = await MongoClient.connect(fresh);
    try {
      const names = (await client.db().admin().listDatabases()).databases.map(
        (d) => d.name,
      );
      expect(names).not.toContain(`sysid_fresh_${tag}`);
    } finally {
      await client.close();
    }
  });

  it('check is read-only, apply refuses duplicates, then creates a partial unique index that rejects them', async () => {
    const client = await MongoClient.connect(url);
    const col = client.db().collection('Installation');
    try {
      await col.insertMany([
        { name: 'a' },
        { name: 'b' },
        { name: 'c', externalSystemId: 'pi-x' },
        { name: 'd', externalSystemId: 'pi-x' },
      ]);

      const check = run('check');
      // Non-zero with duplicates, so deploy-update.sh stops before build and restart.
      expect(check.status).toBe(3);
      expect(check.stderr).toMatch(/duplicate systemIds found/);
      expect(check.stdout).toMatch(/index .*: missing/);
      expect(check.stdout).toMatch(/duplicate systemIds: 1/);
      expect(check.stdout).toMatch(/"pi-x" used by 2 installations/);
      expect(`${check.stdout}${check.stderr}`).not.toMatch(/mongodb:\/\//);
      expect((await col.indexes()).map((i) => i.name)).toEqual(['_id_']);

      const refused = run('apply');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toMatch(/refusing to create the index/);

      await col.updateOne({ name: 'd' }, { $unset: { externalSystemId: '' } });
      const apply = run('apply');
      expect([apply.status, apply.stdout]).toEqual([
        0,
        expect.stringMatching(
          /created Installation_externalSystemId_unique_when_set/,
        ),
      ]);
      expect(run('apply').stdout).toMatch(/already present: nothing to do/);
      expect(run('check').status).toBe(0); // clean again

      await expect(
        col.insertOne({ name: 'e', externalSystemId: 'pi-x' }),
      ).rejects.toThrow(/E11000/);
      await col.insertOne({ name: 'f' }); // several without a systemId are fine
    } finally {
      await client.db().dropDatabase();
      await client.close();
    }
  });
});
