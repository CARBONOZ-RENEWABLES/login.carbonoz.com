/**
 * Bridge delivery semantics with in-memory fakes of the Redis stream (XREAD,
 * consumer groups, XAUTOCLAIM, trimming) and of the idempotent store.
 * SYNTHETIC TEST DATA ONLY. The real Redis + MongoDB path is covered by
 * test/ingest-bridge.e2e-spec.ts.
 */
import {
  cmpId,
  parseStartId,
  SolarIngestBridge,
} from './solar-ingest-bridge.service';

type Entry = { id: string; message: Record<string, string> };
const delivery = (site: string, ts: string, pv = 1000) => ({
  payload: JSON.stringify({ site, readings: [{ ts, metrics: { pv_w: pv } }] }),
});

/** Just enough of a Redis stream with one consumer group. */
class FakeStream {
  entries: Entry[] = [];
  group = {
    exists: true,
    lastDelivered: '0-0',
    pel: new Map<string, { consumer: string; at: number }>(),
  };
  add(...e: Entry[]) {
    this.entries.push(...e);
  }
  trim(n: number) {
    this.entries.splice(0, n);
  }
  get(id: string) {
    return this.entries.find((e) => e.id === id);
  }
  client(consumerName: string) {
    const reply = (list: Entry[]) =>
      list.length ? [{ name: 'ingest:readings', messages: list }] : null;
    return {
      isOpen: true,
      isReady: true,
      on: () => undefined,
      connect: async () => undefined,
      disconnect: async () => undefined,
      xRead: async ({ id }: { id: string }) => {
        await new Promise((r) => setTimeout(r, 2));
        return reply(
          this.entries.filter((e) => cmpId(e.id, id) > 0).slice(0, 10),
        );
      },
      xRange: async (_k: string, a: string, b: string) =>
        a === '-'
          ? this.entries.slice(0, 1)
          : b === '+'
          ? this.entries.filter((e) => cmpId(e.id, a) >= 0)
          : this.entries.filter((e) => e.id === a && a === b),
      xRevRange: async () => this.entries.slice(-1),
      xReadGroup: async (
        _g: string,
        consumer: string,
        { id }: { id: string },
      ) => {
        await new Promise((r) => setTimeout(r, 2));
        if (!this.group.exists)
          throw new Error('NOGROUP No such key or consumer group');
        if (id === '0')
          return reply(
            [...this.group.pel]
              .filter(([, p]) => p.consumer === consumer)
              .map(
                ([pid]) =>
                  this.get(pid) ??
                  ({ id: pid, message: null } as unknown as Entry),
              ),
          );
        const fresh = this.entries
          .filter((e) => cmpId(e.id, this.group.lastDelivered) > 0)
          .slice(0, 10);
        for (const e of fresh) {
          this.group.pel.set(e.id, { consumer, at: Date.now() });
          this.group.lastDelivered = e.id;
        }
        return reply(fresh);
      },
      xAck: async (_k: string, _g: string, id: string) => {
        this.group.pel.delete(id);
      },
      xAutoClaim: async (
        _k: string,
        _g: string,
        consumer: string,
        minIdle: number,
      ) => {
        const messages: Entry[] = [];
        const deletedMessages: string[] = [];
        for (const [id, p] of this.group.pel) {
          if (p.consumer === consumer || Date.now() - p.at < minIdle) continue;
          const e = this.get(id);
          if (!e) {
            this.group.pel.delete(id);
            deletedMessages.push(id);
          } else {
            this.group.pel.set(id, { consumer, at: Date.now() });
            messages.push(e);
          }
        }
        return { nextId: '0-0', messages, deletedMessages };
      },
      xLen: async () => this.entries.length,
      sendCommand: async () => null,
      name: consumerName,
    };
  }
}

function setup(
  opts: {
    mode?: 'xread' | 'group';
    consumer?: string;
    storeFails?: number;
    cursorFails?: number;
    handleThrows?: number;
    stream?: FakeStream;
    db?: Db;
    startId?: string;
  } = {},
) {
  const stream = opts.stream ?? new FakeStream();
  const db: Db = opts.db ?? {
    lock: null,
    cursor: null,
    deadLetters: [],
    cursorWrites: 0,
    stored: new Map(),
    installations: [
      { systemId: 'known', id: 'inst-1', siteId: 'site-1', active: true },
      { systemId: 'off', id: 'inst-2', siteId: 'site-2', active: false },
      { systemId: 'twice', id: 'inst-3', siteId: 'site-3', active: true },
      { systemId: 'twice', id: 'inst-4', siteId: 'site-4', active: true },
    ],
  };
  let storeFails = opts.storeFails ?? 0;
  let cursorFails = opts.cursorFails ?? 0;
  const prisma = {
    solarIngestCursor: {
      findUnique: async () => (db.cursor ? { lastId: db.cursor } : null),
      upsert: async ({
        create,
        update,
      }: {
        create: { lastId: string };
        update: { lastId?: string };
      }) => {
        if (cursorFails > 0) {
          cursorFails--;
          throw new Error('mongo down');
        }
        db.cursorWrites++;
        db.cursor =
          db.cursor === null ? create.lastId : update.lastId ?? db.cursor;
      },
    },
    // Shared lock row (two bridges may share one Db).
    solarBridgeLock: {
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          owner?: string;
          OR?: [{ owner: string }, { until: { lt: Date } }];
        };
        data: { owner?: string; until: Date };
      }) => {
        const l = db.lock;
        if (!where.OR) {
          // release on shutdown
          if (l && l.owner === where.owner) l.until = data.until;
          return { count: l ? 1 : 0 };
        }
        if (
          l &&
          (l.owner === where.OR[0].owner || l.until < where.OR[1].until.lt)
        ) {
          db.lock = { owner: data.owner as string, until: data.until };
          return { count: 1 };
        }
        return { count: 0 };
      },
      create: async ({ data }: { data: { owner: string; until: Date } }) => {
        if (db.lock) throw Object.assign(new Error('dup'), { code: 'P2002' });
        db.lock = { owner: data.owner, until: data.until };
      },
    },
    installation: {
      findMany: async ({ where }: { where: { externalSystemId: string } }) =>
        db.installations
          .filter((i) => i.systemId === where.externalSystemId)
          .slice(0, 2),
    },
    solarDeadLetter: {
      upsert: async ({ create }: { create: DL }) => {
        if (!db.deadLetters.some((d) => d.streamId === create.streamId))
          db.deadLetters.push({
            ...create,
            id: `dl${db.deadLetters.length + 1}`,
          });
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.deadLetters.find((d) => d.id === where.id) ?? null,
      delete: async ({ where }: { where: { id: string } }) => {
        db.deadLetters = db.deadLetters.filter((d) => d.id !== where.id);
      },
    },
  };
  // Idempotent store: a messageId is stored once (unique index), later calls are no-ops.
  const store = {
    processStreamMessage: async (m: {
      installationId: string;
      messageId: string;
    }) => {
      if (storeFails > 0) {
        storeFails--;
        return { stored: false, error: 'mongo down', transient: true };
      }
      db.stored.set(
        m.messageId,
        (db.stored.get(m.messageId) ?? 0) +
          (db.stored.has(m.messageId) ? 0 : 1),
      );
      return { stored: true };
    },
  };
  const config = {
    get: () => ({
      enabled: true,
      redisUrl: 'redis://fake',
      streamKey: 'ingest:readings',
      payloadField: '',
      startId: opts.startId ?? '0-0',
      batchSize: 10,
      blockMs: 10,
      mode: opts.mode ?? 'xread',
      group: 'carbonoz-bridge',
      consumer: opts.consumer ?? 'c1',
      claimIdleMs: 30,
    }),
  };
  let throwsLeft = opts.handleThrows ?? 0;
  class TestBridge extends SolarIngestBridge {
    protected backoffMs = [5];
    protected makeClient() {
      return stream.client(opts.consumer ?? 'c1') as never;
    }
    async handle(id: string, fields: Record<string, string>) {
      if (throwsLeft > 0 && fields?.poison) {
        throwsLeft--;
        throw new TypeError('unexpected');
      }
      return super.handle(id, fields);
    }
  }
  const bridge = new TestBridge(
    config as never,
    prisma as never,
    store as never,
  );
  return {
    bridge,
    stream,
    db,
    start: () => bridge.onApplicationBootstrap(),
    stop: () => bridge.onModuleDestroy(),
  };
}
type DL = { id?: string; streamId: string; error: string; rawText: string };
type Db = {
  lock: { owner: string; until: Date } | null;
  cursor: string | null;
  deadLetters: DL[];
  cursorWrites: number;
  stored: Map<string, number>;
  installations: {
    systemId: string;
    id: string;
    siteId: string;
    active: boolean;
  }[];
};

const until = async (fn: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
};
const storedOnce = (db: Db) => [...db.stored.values()].every((n) => n === 1);

describe('ingest bridge — xread mode (read-only account, cursor in MongoDB)', () => {
  jest.setTimeout(20000);

  it('stores every reading once and moves the cursor only after storing', async () => {
    const s = setup();
    s.stream.add(
      { id: '1-0', message: delivery('known', '2026-09-29T08:00:00Z') },
      { id: '2-0', message: delivery('known', '2026-09-29T08:01:00Z') },
    );
    s.start();
    await until(() => s.db.cursor === '2-0');
    expect(s.db.stored.size).toBe(2);
    await s.stop();
  });

  it('MongoDB down while storing: cursor stays, entry retried, nothing lost or doubled', async () => {
    const s = setup({ storeFails: 3 });
    s.stream.add({
      id: '1-0',
      message: delivery('known', '2026-09-29T08:00:00Z'),
    });
    s.start();
    await until(() => s.db.cursor === '1-0');
    expect(s.db.stored.size).toBe(1);
    expect(storedOnce(s.db)).toBe(true);
    expect(s.bridge.stats.lastError).toMatch(/store: mongo down/);
    await s.stop();
  });

  it('MongoDB down while saving the cursor: entry replayed, deduplicated, cursor saved later', async () => {
    const s = setup({ cursorFails: 2 });
    s.stream.add({
      id: '1-0',
      message: delivery('known', '2026-09-29T08:00:00Z'),
    });
    s.start();
    await until(() => s.db.cursor === '1-0');
    expect(storedOnce(s.db)).toBe(true);
    await s.stop();
  });

  it('restart resumes after the stored cursor', async () => {
    const a = setup();
    a.stream.add({
      id: '1-0',
      message: delivery('known', '2026-09-29T08:00:00Z'),
    });
    a.start();
    await until(() => a.db.cursor === '1-0');
    await a.stop();
    a.stream.add({
      id: '2-0',
      message: delivery('known', '2026-09-29T08:01:00Z'),
    });
    const b = setup({ stream: a.stream, db: a.db });
    b.start();
    await until(() => b.db.cursor === '2-0');
    expect(b.db.cursorWrites).toBe(2);
    expect(storedOnce(b.db)).toBe(true);
    await b.stop();
  });

  it('stream trimmed past the cursor: the gap is recorded for audit and reading continues', async () => {
    const a = setup();
    a.stream.add({
      id: '1-0',
      message: delivery('known', '2026-09-29T08:00:00Z'),
    });
    a.start();
    await until(() => a.db.cursor === '1-0');
    await a.stop();
    // While the bridge was down: 2-0 and 3-0 arrived, then the stream was trimmed past 2-0.
    a.stream.add(
      { id: '2-0', message: delivery('known', '2026-09-29T08:01:00Z') },
      { id: '3-0', message: delivery('known', '2026-09-29T08:02:00Z') },
    );
    a.stream.trim(2);
    const b = setup({ stream: a.stream, db: a.db });
    b.start();
    await until(() => b.db.cursor === '3-0');
    expect(b.db.deadLetters.map((d) => d.streamId)).toEqual([
      'ingest:readings/gap/1-0..3-0',
    ]);
    expect(b.db.deadLetters[0].error).toMatch(/never processed/);
    await b.stop();
  });

  it('unknown, ambiguous (shared systemId) and deactivated installations and invalid entries are recorded, never stored, never blocking', async () => {
    const s = setup();
    s.stream.add(
      { id: '1-0', message: delivery('unknown-pi', '2026-09-29T08:00:00Z') },
      { id: '2-0', message: delivery('twice', '2026-09-29T08:00:00Z') },
      { id: '3-0', message: delivery('off', '2026-09-29T08:00:00Z') },
      {
        id: '4-0',
        message: { payload: '{not json', token: 'secret-should-not-be-kept' },
      },
      { id: '5-0', message: delivery('known', '2026-09-29T08:02:00Z') },
    );
    s.start();
    await until(() => s.db.cursor === '5-0');
    expect(s.db.deadLetters.map((d) => [d.streamId, d.error])).toEqual([
      ['ingest:readings/1-0', 'no installation with systemId "unknown-pi"'],
      [
        'ingest:readings/2-0',
        'systemId "twice" is used by more than one installation',
      ],
      ['ingest:readings/3-0', 'installation for "off" is deactivated'],
      ['ingest:readings/4-0', 'no delivery JSON in the stream entry'],
    ]);
    expect(s.db.deadLetters[3].rawText).not.toContain(
      'secret-should-not-be-kept',
    );
    expect(s.db.stored.size).toBe(1);
    await s.stop();
  });

  it('a poison entry is recorded after 5 attempts instead of blocking or disappearing', async () => {
    const s = setup({ handleThrows: 99 });
    s.stream.add(
      {
        id: '1-0',
        message: { ...delivery('known', '2026-09-29T08:00:00Z'), poison: '1' },
      },
      { id: '2-0', message: delivery('known', '2026-09-29T08:01:00Z') },
    );
    s.start();
    await until(() => s.db.cursor === '2-0');
    expect(s.db.deadLetters).toHaveLength(1);
    expect(s.db.deadLetters[0].error).toMatch(/failed 5 times: unexpected/);
    await s.stop();
  });

  it('replay: after the missing installation is registered, a dead letter is stored and removed', async () => {
    const s = setup();
    s.stream.add({
      id: '1-0',
      message: delivery('new-pi', '2026-09-29T08:00:00Z'),
    });
    s.start();
    await until(() => s.db.cursor === '1-0');
    await s.stop();
    const dl = s.db.deadLetters[0];
    s.db.installations.push({
      systemId: 'new-pi',
      id: 'inst-9',
      siteId: 'site-9',
      active: true,
    });
    const fresh = setup({ stream: s.stream, db: s.db });
    expect(await fresh.bridge.replay(dl.id as string)).toEqual({
      replayed: true,
    });
    expect(s.db.deadLetters).toHaveLength(0);
    expect(s.db.stored.size).toBe(1);
    await expect(fresh.bridge.replay('nope')).rejects.toThrow(
      /Not a replayable/,
    );
  });
});

describe("ingest bridge — group mode (Felix's consumer group)", () => {
  jest.setTimeout(20000);

  it('acknowledges only after storing; nothing left pending', async () => {
    const s = setup({ mode: 'group' });
    s.stream.add(
      { id: '1-0', message: delivery('known', '2026-09-29T08:00:00Z') },
      { id: '2-0', message: delivery('known', '2026-09-29T08:01:00Z') },
    );
    s.start();
    await until(() => s.db.stored.size === 2 && s.stream.group.pel.size === 0);
    await s.stop();
  });

  it('MongoDB down: the entry stays pending (not acked) and is stored once when MongoDB is back', async () => {
    const s = setup({ mode: 'group', storeFails: 3 });
    s.stream.add({
      id: '1-0',
      message: delivery('known', '2026-09-29T08:00:00Z'),
    });
    s.start();
    await until(() => s.stream.group.pel.size === 1);
    await until(() => s.stream.group.pel.size === 0 && s.db.stored.size === 1);
    expect(storedOnce(s.db)).toBe(true);
    await s.stop();
  });

  it('crash before XACK: the same consumer re-reads its own pending entry after restart, stored once', async () => {
    const stream = new FakeStream();
    stream.add({
      id: '1-0',
      message: delivery('known', '2026-09-29T08:00:00Z'),
    });
    // A previous run delivered 1-0 to c1 and stored it, then died before XACK.
    stream.group.pel.set('1-0', { consumer: 'c1', at: Date.now() });
    stream.group.lastDelivered = '1-0';
    const s = setup({ mode: 'group', stream });
    s.start();
    await until(() => stream.group.pel.size === 0);
    expect(storedOnce(s.db)).toBe(true);
    await s.stop();
  });

  it('entries pending on a crashed consumer are claimed (XAUTOCLAIM) and processed', async () => {
    const stream = new FakeStream();
    stream.add({
      id: '1-0',
      message: delivery('known', '2026-09-29T08:00:00Z'),
    });
    stream.group.pel.set('1-0', {
      consumer: 'old-host',
      at: Date.now() - 60_000,
    });
    stream.group.lastDelivered = '1-0';
    const s = setup({ mode: 'group', stream, consumer: 'c2' });
    s.start();
    await until(() => stream.group.pel.size === 0 && s.db.stored.size === 1);
    await s.stop();
  });

  it('a pending entry trimmed before processing is recorded and released, not silently lost', async () => {
    const stream = new FakeStream();
    stream.add({
      id: '1-0',
      message: delivery('known', '2026-09-29T08:00:00Z'),
    });
    stream.group.pel.set('1-0', {
      consumer: 'old-host',
      at: Date.now() - 60_000,
    });
    stream.group.lastDelivered = '1-0';
    stream.trim(1);
    const s = setup({ mode: 'group', stream, consumer: 'c2' });
    s.start();
    await until(() => s.db.deadLetters.length === 1);
    expect(s.db.deadLetters[0]).toMatchObject({
      streamId: 'ingest:readings/1-0',
      error: 'trimmed from the stream while pending (never processed)',
    });
    expect(stream.group.pel.size).toBe(0);
    await s.stop();
  });

  it('missing consumer group: reports it clearly and waits (never creates it)', async () => {
    const stream = new FakeStream();
    stream.group.exists = false;
    const s = setup({ mode: 'group', stream });
    s.start();
    await until(() => !!s.bridge.stats.lastError);
    expect(s.bridge.stats.lastError).toMatch(
      /consumer group "carbonoz-bridge" does not exist/,
    );
    await s.stop();
  });
});

describe('ingest bridge — start position (INGEST_BRIDGE_START)', () => {
  jest.setTimeout(20000);

  it('accepts only 0-0, <ms>-<seq> and $', () => {
    expect(parseStartId('0-0')).toBe('0-0');
    expect(parseStartId('0')).toBe('0-0');
    expect(parseStartId(undefined)).toBe('0-0');
    expect(parseStartId('1727000000000-3')).toBe('1727000000000-3');
    expect(parseStartId('$')).toBe('$');
    for (const bad of ['>', '+', '-', 'latest', '12-', '1-2-3', '$x', 'abc'])
      expect(parseStartId(bad)).toBeNull();
  });

  it('refuses to start on an invalid value (nothing read, reason in status)', async () => {
    const s = setup({ startId: 'latest' });
    s.stream.add({
      id: '1-0',
      message: delivery('known', '2026-09-29T08:00:00Z'),
    });
    s.start();
    await new Promise((r) => setTimeout(r, 50));
    expect(s.db.stored.size).toBe(0);
    expect(s.bridge.stats.running).toBe(false);
    expect(s.bridge.stats.configError).toMatch(/INGEST_BRIDGE_START/);
    await s.stop();
  });

  it('$ resolves once to the newest entry, stores it, and never skips later entries', async () => {
    const s = setup({ startId: '$' });
    s.stream.add(
      { id: '1-0', message: delivery('known', '2026-09-29T08:00:00Z') },
      { id: '2-0', message: delivery('known', '2026-09-29T08:01:00Z') },
    );
    s.start();
    await until(() => s.db.cursor === '2-0');
    await new Promise((r) => setTimeout(r, 30));
    expect(s.db.stored.size).toBe(0); // existing entries deliberately not processed
    await s.stop();

    // Entries arriving while stopped are processed after a restart ($ is not re-resolved).
    s.stream.add(
      { id: '3-0', message: delivery('known', '2026-09-29T08:02:00Z') },
      { id: '4-0', message: delivery('known', '2026-09-29T08:03:00Z') },
    );
    const again = setup({ startId: '$', stream: s.stream, db: s.db });
    again.start();
    await until(() => again.db.cursor === '4-0');
    expect(again.db.stored.size).toBe(2);
    await again.stop();
  });
});

describe('ingest bridge — single active instance', () => {
  jest.setTimeout(20000);

  it('a second bridge on the same database stands by; it takes over when the first stops', async () => {
    const a = setup();
    const b = setup({ stream: a.stream, db: a.db, consumer: 'c2' });
    for (let i = 1; i <= 20; i++)
      a.stream.add({
        id: `${i}-0`,
        message: delivery(
          'known',
          `2026-09-29T08:${String(i).padStart(2, '0')}:00Z`,
        ),
      });
    a.start();
    await until(() => a.db.cursor === '20-0');
    b.start();
    await until(() => b.bridge.stats.standby === true);
    expect(storedOnce(a.db)).toBe(true);

    await a.stop(); // releases the lock
    a.stream.add({
      id: '21-0',
      message: delivery('known', '2026-09-29T09:00:00Z'),
    });
    await until(() => b.db.cursor === '21-0', 15000);
    expect(b.bridge.stats.standby).toBe(false);
    expect(a.db.stored.size).toBe(21);
    expect(storedOnce(a.db)).toBe(true);
    await b.stop();
  });
});
