import { SolarEnergyHistoryService } from './solar-energy-history.service';

/**
 * The daily cache must never keep a value computed while the worker was
 * storing readings for that day (backfill racing a dashboard request).
 */
describe('energy day cache guard', () => {
  function setup(marks: (string | null)[]) {
    const cache: { day: string }[] = [];
    const prisma = {
      solarSample: {
        findFirst: async () => ({ ts: new Date('2026-09-01T08:00:00Z') }),
        aggregateRaw: async () => [],
      },
      installation: { count: async () => 1 },
      solarEnergyDay: {
        findMany: async () => [],
        createMany: async ({ data }: { data: { day: string }[] }) => {
          cache.push(...data);
          return { count: data.length };
        },
        deleteMany: async ({ where }: { where: { day: { in: string[] } } }) => {
          for (const d of where.day.in) {
            const i = cache.findIndex((c) => c.day === d);
            if (i >= 0) cache.splice(i, 1);
          }
          return { count: 0 };
        },
      },
    };
    let call = 0;
    const redis = {
      ready: marks.every((m) => m !== null),
      get: async () => marks[Math.min(call++, marks.length - 1)],
      set: async () => undefined,
    };
    const svc = new SolarEnergyHistoryService(prisma as never, redis as never);
    return { svc, cache };
  }
  const now = new Date('2026-09-30T12:00:00Z');
  const site = { id: 'a'.repeat(24), timezone: 'Europe/Berlin' };

  it('caches settled days when nothing changed meanwhile', async () => {
    const { svc, cache } = setup(['m1', 'm1']);
    await svc.history(site, '30d', undefined, now);
    expect(cache.length).toBeGreaterThan(20);
    expect(cache.map((c) => c.day)).not.toContain('2026-09-29'); // not settled yet
  });

  it('drops what it cached when the worker invalidated during the computation', async () => {
    const { svc, cache } = setup(['m1', 'm2']);
    await svc.history(site, '30d', undefined, now);
    expect(cache).toEqual([]);
  });

  it('caches nothing when Redis cannot be asked', async () => {
    const { svc, cache } = setup([null]);
    const r = await svc.history(site, '30d', undefined, now);
    expect(r.buckets).toHaveLength(30);
    expect(cache).toEqual([]);
  });
});
