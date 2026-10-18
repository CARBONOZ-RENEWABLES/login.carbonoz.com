/* eslint-disable */
/**
 * Database guarantee that an installation's systemId (externalSystemId) is
 * unique — the Raspberry ingest bridge routes readings by it.
 *
 * A Prisma `@unique` can't express this on MongoDB: every installation
 * WITHOUT a systemId would collide on null. This creates a PARTIAL unique
 * index (only string values), which `prisma db push` leaves in place.
 *
 *   node scripts/installation-system-id-index.js check   # READ-ONLY: duplicates and index state; exit 3 if duplicates
 *   node scripts/installation-system-id-index.js apply   # create the index (idempotent)
 *
 * DATABASE_URL is read from the environment (or server-api/.env); it is never
 * printed. `apply` refuses to run while duplicates exist — resolve them in
 * Admin → Installations first. Plain Node, no build or ts-node needed.
 */
const path = require('path');
try {
  // Optional: server-api/.env, as the API itself reads it (dotenv comes with @nestjs/config).
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* environment only */
}
const { PrismaClient } = require('@prisma/client');

const NAME = 'Installation_externalSystemId_unique_when_set';
const mode = process.argv[2];

(async () => {
  if (mode !== 'check' && mode !== 'apply') {
    console.error(
      'usage: node scripts/installation-system-id-index.js check|apply',
    );
    process.exit(2);
  }
  const prisma = new PrismaClient();
  try {
    const dup = await prisma.$runCommandRaw({
      aggregate: 'Installation',
      pipeline: [
        { $match: { externalSystemId: { $type: 'string' } } },
        {
          $group: {
            _id: '$externalSystemId',
            n: { $sum: 1 },
            ids: { $push: { $toString: '$_id' } },
          },
        },
        { $match: { n: { $gt: 1 } } },
      ],
      cursor: {},
    });
    const duplicates = dup.cursor.firstBatch;
    const empty = await prisma.$runCommandRaw({
      count: 'Installation',
      query: { externalSystemId: '' },
    });
    // Index names via $indexStats (a full listIndexes spec contains `$type`,
    // which Prisma's raw decoder rejects). Needs the indexStats privilege;
    // without it the state is reported as unknown — apply works either way.
    const present = await prisma
      .$runCommandRaw({
        aggregate: 'Installation',
        pipeline: [{ $indexStats: {} }, { $project: { _id: 0, name: 1 } }],
        cursor: {},
      })
      .then((r) => r.cursor.firstBatch.some((i) => i.name === NAME))
      .catch(() => null);
    console.log(
      `index ${NAME}: ${
        present === null
          ? 'unknown (no indexStats privilege)'
          : present
          ? 'present'
          : 'missing'
      }`,
    );
    console.log(`installations with an empty-string systemId: ${empty.n}`);
    console.log(`duplicate systemIds: ${duplicates.length}`);
    for (const d of duplicates)
      console.log(
        `  "${d._id}" used by ${d.n} installations: ${d.ids.join(', ')}`,
      );
    if (mode === 'check') {
      // Non-zero so `deploy-update.sh` (set -e) stops before building and restarting.
      if (duplicates.length) {
        console.error(
          'duplicate systemIds found: resolve them in Admin → Installations before deploying or applying the index',
        );
        process.exitCode = 3;
      }
      return;
    }
    if (duplicates.length || empty.n > 1) {
      console.error(
        'refusing to create the index: resolve the duplicates above first',
      );
      process.exitCode = 1;
      return;
    }
    // Idempotent: MongoDB answers "all indexes already exist" for the same spec.
    const r = await prisma.$runCommandRaw({
      createIndexes: 'Installation',
      indexes: [
        {
          key: { externalSystemId: 1 },
          name: NAME,
          unique: true,
          partialFilterExpression: { externalSystemId: { $type: 'string' } },
        },
      ],
    });
    console.log(
      r.createdCollectionAutomatically || r.numIndexesAfter > r.numIndexesBefore
        ? `created ${NAME}`
        : `${NAME} already present: nothing to do`,
    );
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error('failed:', e.message);
  process.exit(1);
});
