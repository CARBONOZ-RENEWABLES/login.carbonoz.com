/**
 * ../ops/redis/ingest-stream-trim.sh against the e2e Redis (synthetic streams
 * only). Production 5–14 Nov 2026: `ingest:readings` was never trimmed, filled
 * the 1 GB Redis (noeviction) and stopped ingestion. The trim must free
 * processed entries and never remove one a consumer group has not finished.
 */
import { spawnSync } from 'child_process';
import { join } from 'path';
import { readState } from './support/stack';

const SCRIPT = join(
  __dirname,
  '..',
  '..',
  'ops',
  'redis',
  'ingest-stream-trim.sh',
);
const port = () => String(readState().redisPort);
const DAY = 86_400_000;
let n = 0;

const cli = (...args: string[]) => {
  const r = spawnSync('redis-cli', ['--raw', '-p', port(), ...args], {
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
};
const trim = (stream: string, env: Record<string, string> = {}) =>
  spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, REDIS_PORT: port(), STREAM: stream, ...env },
  });
const ids = (stream: string) =>
  cli('XRANGE', stream, '-', '+')
    .split('\n')
    .filter((l) => /^\d+-\d+$/.test(l));

/** A stream with entries at the given ages (ms ago), oldest first. */
function stream(agesMs: number[]) {
  const key = `test:trim:${Date.now()}:${n++}`;
  const now = Date.now();
  return {
    key,
    ids: agesMs.map((age, i) =>
      cli('XADD', key, `${now - age}-${i}`, 'payload', `{"n":${i}}`),
    ),
  };
}
/** Delivers `read` entries to a consumer of `group`, then acks the first `ack`. */
function consume(key: string, group: string, read: number, ack: number) {
  cli('XGROUP', 'CREATE', key, group, '0');
  if (read === 0) return;
  const got = cli(
    'XREADGROUP',
    'GROUP',
    group,
    'c1',
    'COUNT',
    String(read),
    'STREAMS',
    key,
    '>',
  )
    .split('\n')
    .filter((l) => /^\d+-\d+$/.test(l));
  if (ack > 0) cli('XACK', key, group, ...got.slice(0, ack));
}

describe('ingest-stream-trim', () => {
  it('refuses without a consumer group and leaves the stream alone', () => {
    const s = stream([10 * DAY, 9 * DAY]);
    const r = trim(s.key);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/no consumer group/);
    expect(ids(s.key)).toEqual(s.ids);
  });

  it('refuses when the stream does not exist', () => {
    const r = trim('test:trim:missing');
    expect(r.status).toBe(2);
  });

  it('refuses when an expected group is missing', () => {
    const s = stream([10 * DAY]);
    consume(s.key, 'other', 1, 1);
    const r = trim(s.key, { EXPECT_GROUPS: 'carbonoz-bridge' });
    expect(r.status).toBe(2);
    expect(ids(s.key)).toEqual(s.ids);
  });

  it('never trims pending or undelivered entries, however old', () => {
    // 5 entries, all 10+ days old: 2 acked, 1 pending, 2 never delivered.
    const s = stream([14 * DAY, 13 * DAY, 12 * DAY, 11 * DAY, 10 * DAY]);
    consume(s.key, 'carbonoz-bridge', 3, 2);
    const r = trim(s.key, { EXPECT_GROUPS: 'carbonoz-bridge' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/trimmed=2 /);
    expect(r.stderr).toMatch(/older than 7d/); // stuck consumer is flagged
    expect(ids(s.key)).toEqual(s.ids.slice(2));
  });

  it('keeps processed entries younger than the retention window', () => {
    const s = stream([10 * DAY, 8 * DAY, DAY, 3_600_000]);
    consume(s.key, 'carbonoz-bridge', 4, 4);
    const r = trim(s.key);
    expect(r.status).toBe(0);
    expect(ids(s.key)).toEqual(s.ids.slice(2));
  });

  it('the slowest group holds the trim point', () => {
    const s = stream([10 * DAY, 9 * DAY, 8 * DAY]);
    consume(s.key, 'fast', 3, 3);
    consume(s.key, 'slow', 0, 0); // created, nothing read yet
    expect(trim(s.key).status).toBe(0);
    expect(ids(s.key)).toEqual(s.ids);
  });

  it('dry run changes nothing', () => {
    const s = stream([10 * DAY, 9 * DAY]);
    consume(s.key, 'carbonoz-bridge', 2, 2);
    const r = trim(s.key, { DRY_RUN: '1' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/dry-run length=2 /);
    expect(ids(s.key)).toEqual(s.ids);
  });

  describe('under memory pressure', () => {
    let original: string;
    beforeAll(() => {
      original = cli('CONFIG', 'GET', 'maxmemory').split('\n')[1];
      cli('CONFIG', 'SET', 'maxmemory', String(1024 * 1024 * 1024));
    });
    afterAll(() => cli('CONFIG', 'SET', 'maxmemory', original));

    it('trims every processed entry, still never an unprocessed one', () => {
      const s = stream([3_600_000, 1_800_000, 600_000, 60_000]);
      consume(s.key, 'carbonoz-bridge', 3, 2); // 2 acked, 1 pending, 1 new
      // PRESSURE_PCT=0: any used memory counts as pressure.
      const r = trim(s.key, { PRESSURE_PCT: '0' });
      expect(r.stdout).toMatch(/trimmed=2 .*all processed entries/);
      expect(ids(s.key)).toEqual(s.ids.slice(2));
      // Still at "pressure" after trimming: reported for monitoring.
      expect(r.status).toBe(3);
      expect(r.stderr).toMatch(/ALERT/);
    });
  });
});
