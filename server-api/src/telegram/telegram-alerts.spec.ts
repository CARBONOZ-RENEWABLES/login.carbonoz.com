import {
  alarmRef,
  AlertPrefs,
  batteryText,
  conditionsNow,
  DEFAULT_THRESHOLDS,
  FLEET,
  FLEET_IDLE,
  FleetRow,
  FleetState,
  fleetStatus,
  freshness,
  OpenIncident,
  SiteSnapshot,
  SnapshotAlarm,
  SnapshotDevice,
  statusText,
  transition,
} from './telegram-alerts';
import { TelegramApi, TelegramApiError } from './telegram-api';
import { telegramConfig } from './telegram.config';

// Synthetic fixtures only (clearly not a real site).
const NOW = Date.parse('2026-10-24T12:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const sys = (
  installationId: string,
  minAgo: number,
  metrics: Record<string, unknown> = {},
): SnapshotDevice => ({
  installationId,
  kind: 'SYSTEM',
  externalId: 'sys',
  ts: ago(minAgo),
  metrics: {
    soc_pct: 55,
    battery_power_w: -1200,
    pv_power_w: 0,
    load_power_w: 1300,
    ...metrics,
  },
});

/** One site; `devices` decides freshness, `updatedAt` follows the newest device as in SolarReadService.latest. */
const site = (
  devices: SnapshotDevice[],
  over: Partial<SiteSnapshot> = {},
  installations = [...new Set(devices.map((d) => d.installationId))].map(
    (id) => ({ id, name: `Pi ${id}`, active: true }),
  ),
): SiteSnapshot => ({
  siteId: 's1',
  siteName: 'Synthetic site',
  timezone: 'Africa/Kigali',
  updatedAt: devices.reduce<string | null>(
    (a, d) => (!a || d.ts > a ? d.ts : a),
    null,
  ),
  installations: installations.length
    ? installations
    : [{ id: 'i1', name: 'Pi i1', active: true }],
  devices,
  alarms: [],
  ...over,
});
const snap = (
  metrics: Record<string, unknown> = {},
  minAgo = 1,
  over: Partial<SiteSnapshot> = {},
) => site([sys('i1', minAgo, metrics)], over);
const empty = () => site([]);

const PREFS: AlertPrefs = {
  lowSocPct: 20,
  notifyLowSoc: true,
  notifyOffline: true,
  notifyStale: true,
  notifyAlarms: true,
  notifyRecovery: true,
};
const T = DEFAULT_THRESHOLDS;
const kinds = (s: SiteSnapshot, open: OpenIncident[] = [], prefs = PREFS) =>
  conditionsNow(s, prefs, open, NOW)
    .map((c) => (c.ref && c.kind !== 'ALARM' ? `${c.kind}:${c.ref}` : c.kind))
    .sort();
/** Resolutions of `open` against `s`, as [kind, announce]. */
const resolutions = (
  s: SiteSnapshot,
  open: OpenIncident[],
  prefs = PREFS,
  opts = {},
) =>
  transition(
    conditionsNow(s, prefs, open, NOW, T, opts),
    open,
    s,
    prefs,
    NOW,
  ).resolve.map((r) => [r.incident.kind, r.announce]);
const lowOpen = (thresholdPct = 20): OpenIncident => ({
  id: 'i-low',
  kind: 'LOW_SOC',
  detail: { socPct: 12, thresholdPct },
});
const alarm = {
  id: 'e1',
  installationId: 'i1',
  deviceKind: 'BMS',
  deviceExternalId: 'pack-1-bms',
  severity: 'ALARM',
  code: 'cell_ov',
  message: 'Cell over-voltage',
  ts: ago(2),
};

describe('freshness', () => {
  it('site label: live while any device is at most 5 min old (dashboard rule), then delayed, then offline', () => {
    expect(freshness(snap({}, 1), NOW)).toBe('fresh');
    expect(freshness(snap({}, 6), NOW)).toBe('stale');
    expect(freshness(snap({}, 90), NOW)).toBe('offline');
    expect(freshness(empty(), NOW)).toBe('unavailable');
  });
});

describe('conditions', () => {
  it('low SoC at or below the threshold, only on live data', () => {
    expect(kinds(snap({ soc_pct: 21 }))).toEqual([]);
    expect(kinds(snap({ soc_pct: 20 }))).toEqual(['LOW_SOC']);
    expect(
      kinds(snap({ soc_pct: 12 }), [], { ...PREFS, notifyLowSoc: false }),
    ).toEqual([]);
  });

  it('hysteresis: an open low-SoC incident stays open until its threshold + 5', () => {
    expect(kinds(snap({ soc_pct: 24 }), [lowOpen()])).toEqual(['LOW_SOC']);
    expect(kinds(snap({ soc_pct: 25 }), [lowOpen()])).toEqual([]);
  });

  it('stale data neither opens nor clears a low-SoC incident (unknown, not recovered)', () => {
    const stale = snap({ soc_pct: 80 }, 30);
    expect(kinds(stale)).toEqual(['STALE:i1']);
    expect(kinds(stale, [lowOpen()])).toEqual(['LOW_SOC', 'STALE:i1']);
    expect(kinds(snap({ soc_pct: 5 }, 8))).toEqual([]); // delayed 8 min: no alert from it
  });

  it('missing SoC is never treated as low or as recovered', () => {
    const s = site([{ ...sys('i1', 1), metrics: { pv_power_w: 10 } }]);
    expect(kinds(s)).toEqual([]);
    expect(kinds(s, [lowOpen()])).toEqual(['LOW_SOC']);
  });

  it('keeps an actual alarm apart from delayed data and from no data', () => {
    expect(
      kinds(
        snap({}, 1, {
          alarms: [alarm, { ...alarm, id: 'e2', severity: 'INFO' }],
        }),
      ),
    ).toEqual(['ALARM']);
    expect(kinds(snap({}, 90))).toEqual(['OFFLINE:i1']);
    expect(kinds(empty())).toEqual(['UNAVAILABLE:i1']);
  });
});

describe('H1: several installations at one site', () => {
  it('a delayed installation reporting a low SoC raises no low-battery alert while another is live', () => {
    const s = site([
      sys('a', 1, { soc_pct: 80 }),
      sys('b', 30, { soc_pct: 10 }),
    ]);
    expect(kinds(s)).toEqual(['STALE:b']);
    const text = batteryText(s, NOW);
    expect(text).toContain('State of charge: 80%');
    expect(text).toContain('Pi b is delayed');
    expect(statusText(s, NOW)).toContain('Battery: 80%');
  });

  it('the stale low SoC is not used even when the live installation reports none', () => {
    const s = site([
      { ...sys('a', 1), metrics: { pv_power_w: 500 } },
      sys('b', 7, { soc_pct: 10 }),
    ]);
    expect(kinds(s)).toEqual([]);
    expect(batteryText(s, NOW)).toContain('State of charge: not reported');
  });

  it('a live installation with a low SoC still alerts; live values are averaged as on the dashboard', () => {
    const s = site([
      sys('a', 1, { soc_pct: 10 }),
      { ...sys('b', 1), metrics: { pv_power_w: 800 } },
    ]);
    expect(kinds(s)).toEqual(['LOW_SOC']);
    // Two live batteries at 10% and 70%: the site SoC is 40% (dashboard headline), no alert.
    expect(
      kinds(site([sys('a', 1, { soc_pct: 10 }), sys('b', 1, { soc_pct: 70 })])),
    ).toEqual([]);
  });

  it('an offline installation is detected; the healthy one is not marked offline', () => {
    const s = site([sys('a', 1), sys('b', 90)]);
    expect(kinds(s)).toEqual(['OFFLINE:b']);
    const c = conditionsNow(s, PREFS, [], NOW).find(
      (x) => x.kind === 'OFFLINE',
    );
    expect(c?.detail.installationName).toBe('Pi b');
  });

  it('an installation that never reported is "no data"; an inactive one is not watched', () => {
    const s = site([sys('a', 1)], {}, [
      { id: 'a', name: 'Pi a', active: true },
      { id: 'b', name: 'Pi b', active: true },
      { id: 'c', name: 'Pi c', active: false },
    ]);
    expect(kinds(s)).toEqual(['UNAVAILABLE:b']);
  });

  it('when every installation is delayed, the last known values are shown and labelled', () => {
    const s = site([
      sys('a', 20, { soc_pct: 33 }),
      sys('b', 30, { soc_pct: 35 }),
    ]);
    const text = statusText(s, NOW);
    expect(text).toContain('Delayed');
    expect(text).toContain('Battery: 34%');
  });
});

describe('transitions: no duplicates, honest recovery (M1)', () => {
  it('an open incident is not opened again', () => {
    const s = snap({ soc_pct: 10 });
    const tr = transition(
      conditionsNow(s, PREFS, [lowOpen()], NOW),
      [lowOpen()],
      s,
      PREFS,
      NOW,
    );
    expect(tr.open).toEqual([]);
    expect(tr.resolve).toEqual([]);
  });

  it('stale turning offline closes STALE silently (escalation is not a recovery)', () => {
    const open: OpenIncident[] = [
      { id: 'x', kind: 'STALE', ref: 'i1', detail: {} },
    ];
    expect(resolutions(snap({}, 90), open)).toEqual([['STALE', false]]);
  });

  it('fresh data again announces the recovery (unless recovery messages are off)', () => {
    const open: OpenIncident[] = [
      { id: 'x', kind: 'OFFLINE', ref: 'i1', detail: {} },
    ];
    expect(resolutions(snap(), open)).toEqual([['OFFLINE', true]]);
    expect(
      resolutions(snap(), open, { ...PREFS, notifyRecovery: false }),
    ).toEqual([['OFFLINE', false]]);
  });

  it('a genuine battery recovery is announced', () => {
    expect(resolutions(snap({ soc_pct: 26 }), [lowOpen()])).toEqual([
      ['LOW_SOC', true],
    ]);
  });

  it('switching low-battery alerts off while the battery is low closes it silently', () => {
    expect(
      resolutions(snap({ soc_pct: 12 }), [lowOpen()], {
        ...PREFS,
        notifyLowSoc: false,
      }),
    ).toEqual([['LOW_SOC', false]]);
  });

  it('switching alarms off while the alarm is active closes it silently', () => {
    const open: OpenIncident[] = [
      {
        id: 'x',
        kind: 'ALARM',
        ref: alarmRef(alarm),
        detail: { code: 'cell_ov', installationId: 'i1' },
      },
    ];
    const s = snap({}, 1, { alarms: [alarm] });
    expect(resolutions(s, open, { ...PREFS, notifyAlarms: false })).toEqual([
      ['ALARM', false],
    ]);
    // A clear confirmed by the system (absent long enough while reporting) is genuine.
    const confirmed: OpenIncident[] = [
      {
        ...open[0],
        detail: { ...open[0].detail, absentSince: NOW - T.alarmClearMs },
      },
    ];
    expect(resolutions(snap(), confirmed)).toEqual([['ALARM', true]]);
  });

  it('lowering the threshold while the battery stays low never says "recovered"', () => {
    const lower = { ...PREFS, lowSocPct: 10 };
    for (const soc of [12, 15, 19, 24])
      expect(
        resolutions(snap({ soc_pct: soc }), [lowOpen(20)], lower).filter(
          ([, a]) => a,
        ),
      ).toEqual([]);
    // Raising it keeps the alert open; it recovers above the new threshold only.
    const higher = { ...PREFS, lowSocPct: 30 };
    expect(resolutions(snap({ soc_pct: 28 }), [lowOpen(20)], higher)).toEqual(
      [],
    );
    expect(resolutions(snap({ soc_pct: 31 }), [lowOpen(20)], higher)).toEqual([
      ['LOW_SOC', true],
    ]);
  });

  it('a deactivated installation closes its incident silently', () => {
    const open: OpenIncident[] = [
      { id: 'x', kind: 'OFFLINE', ref: 'b', detail: {} },
    ];
    const s = site([sys('a', 1), sys('b', 1)], {}, [
      { id: 'a', name: 'Pi a', active: true },
      { id: 'b', name: 'Pi b', active: false },
    ]);
    expect(resolutions(s, open)).toEqual([['OFFLINE', false]]);
  });
});

describe('M3 / A: Carbonoz-side outage and its backlog', () => {
  const MIN = 60_000;
  /** `n` installations, stored and measured the given minutes ago. */
  const rows = (
    n: number,
    storedMin: number,
    measuredMin = storedMin,
    at = NOW,
  ) =>
    Array.from(
      { length: n },
      (): FleetRow => ({
        storedAt: at - storedMin * MIN,
        measuredAt: at - measuredMin * MIN,
      }),
    );
  const healthy = (at = NOW) => rows(10, 1, 1, at);
  /** Walks the state machine over a list of [minutes after NOW, rows(at)]. */
  const run = (
    steps: [number, (at: number) => FleetRow[]][],
    start = FLEET_IDLE,
  ) => {
    let state: FleetState = start;
    return steps.map(([min, f]) => {
      const at = NOW + min * MIN;
      const r = fleetStatus(f(at), at, state);
      state = r.state;
      return [min, r.phase, r.suppress] as const;
    });
  };

  it('most installations stop being stored at once: outage, data alerts paused', () => {
    const r = fleetStatus([...rows(9, 20), ...rows(1, 1)], NOW, FLEET_IDLE);
    expect([r.phase, r.suppress, r.state.suspectedSince]).toEqual([
      'outage',
      true,
      NOW,
    ]);
  });

  it('a single quiet installation is not an outage', () => {
    expect(
      fleetStatus([...rows(1, 20), ...rows(9, 1)], NOW, FLEET_IDLE).suppress,
    ).toBe(false);
  });

  it('too few installations to tell: never paused', () => {
    expect(fleetStatus(rows(2, 20), NOW, FLEET_IDLE).suppress).toBe(false);
    expect(fleetStatus([], NOW, FLEET_IDLE).suppress).toBe(false);
  });

  it('installations not stored for over a week are not counted', () => {
    const old = rows(20, 8 * 24 * 60);
    expect(fleetStatus([...old, ...healthy()], NOW, FLEET_IDLE).suppress).toBe(
      false,
    );
  });

  /** Steady passes every 5 min for `minutes`, starting at `from`, with `live` of 10 measured live. */
  const steadyFor = (from: number, minutes: number, live = 10) =>
    Array.from(
      { length: minutes / 5 + 1 },
      (_, k): [number, (at: number) => FleetRow[]] => [
        from + k * 5,
        (at) => [
          ...rows(live, 1, 1, at),
          ...rows(10 - live, 1, 1, at).map((r) => ({ ...r, measuredAt: null })),
        ],
      ],
    );
  /** Runs steps and returns the final state. */
  const stateAfter = (
    steps: [number, (at: number) => FleetRow[]][],
    start: FleetState = FLEET_IDLE,
  ) => {
    let state = start;
    for (const [min, f] of steps)
      state = fleetStatus(f(NOW + min * MIN), NOW + min * MIN, state).state;
    return state;
  };

  it('M2: the baseline is the lowest live share over a full hour of steady passes', () => {
    expect(stateAfter(steadyFor(0, 55)).baselineLiveShare).toBeNull(); // not yet an hour
    expect(stateAfter(steadyFor(0, 60)).baselineLiveShare).toBe(1);
    // A pass with 30% stored-quiet while an outage begins is not steady: no change.
    const base = stateAfter(steadyFor(0, 60));
    const onset = fleetStatus(
      [...rows(3, 6, 7, NOW + 61 * MIN), ...rows(7, 1, 1, NOW + 61 * MIN)],
      NOW + 61 * MIN,
      base,
    );
    expect([
      onset.phase,
      onset.state.baselineLiveShare,
      onset.state.steadySince,
    ]).toEqual(['healthy', 1, null]);
  });

  it('M2: a normal recovery does not lower the baseline; only a full steady hour after settling can', () => {
    const base = stateAfter(steadyFor(0, 60)); // baseline 1
    const afterOutage = stateAfter(
      [
        [70, (at) => rows(10, 30, 30, at)], // outage
        [80, (at) => [...rows(9, 0, 1, at), ...rows(1, 0, 60, at)]], // 0.9 >= 0.9: resumes
        [81, (at) => [...rows(9, 0, 1, at), ...rows(1, 0, 61, at)]], // one still behind
        [100, (at) => [...rows(9, 0, 1, at), ...rows(1, 0, 80, at)]],
      ],
      base,
    );
    expect(afterOutage.baselineLiveShare).toBe(1); // not 0.9 (the old drift)
    // A full steady hour after the settle period, at a genuinely lower level: adopted.
    const lowered = stateAfter(steadyFor(140, 60, 9), afterOutage);
    expect(lowered.baselineLiveShare).toBe(0.9);
  });

  it('M2: a six-hour give-up never collapses the baseline; the next outage is still protected', () => {
    const base = stateAfter(steadyFor(0, 60)); // baseline 1
    const h6 = FLEET.maxCatchUpMs / MIN;
    const gaveUp = stateAfter(
      [
        [70, (at) => rows(10, 30, 30, at)],
        [71, (at) => rows(10, 0, 90, at)],
        [71 + h6, (at) => rows(10, 0, 90, at)], // gives up
        // Still 90 min behind for hours afterwards: lagging, never steady.
        ...Array.from(
          { length: 30 },
          (_, k): [number, (at: number) => FleetRow[]] => [
            72 + h6 + k * 10,
            (at) => rows(10, 0, 90, at),
          ],
        ),
      ],
      base,
    );
    expect(gaveUp.baselineLiveShare).toBe(1); // the old code: 0
    // Next outage and backlog: still paused until live again.
    const next = 72 + h6 + 400;
    const phases = run(
      [
        [next, (at) => rows(10, 30, 30, at)],
        [next + 1, (at) => rows(10, 0, 120, at)],
        [next + 30, (at) => rows(10, 0, 60, at)],
        [next + 60, (at) => rows(10, 0, 1, at)],
      ],
      gaveUp,
    );
    expect(phases.map(([, p, s]) => [p, s])).toEqual([
      ['outage', true],
      ['catching_up', true],
      ['catching_up', true],
      ['healthy', false],
    ]);
  });

  it('L2: alternating outage and catch-up does not restart the six-hour limit', () => {
    const h = 60;
    const steps: [number, (at: number) => FleetRow[]][] = [
      [0, (at) => rows(10, 30, 30, at)],
    ];
    // Catch-up and relapse every 30 min, starting 1 min after the outage began, until 346 min.
    for (let k = 0; k < 12; k++) {
      steps.push([1 + k * 30, (at) => rows(10, 0, 90, at)]);
      steps.push([16 + k * 30, (at) => rows(10, 10, 90, at)]);
    }
    steps.push([1 + 6 * h, (at) => rows(10, 0, 90, at)]);
    const phases = run(steps);
    expect(phases[phases.length - 1].slice(1)).toEqual(['gave_up', false]);
    expect(phases.slice(0, -1).every(([, , s]) => s)).toBe(true);
  });

  it('L1: every state carries the time it was computed', () => {
    const s1 = fleetStatus(healthy(), NOW, FLEET_IDLE).state;
    const s2 = fleetStatus(healthy(NOW + MIN), NOW + MIN, s1).state;
    expect([s1.updatedAt, s2.updatedAt]).toEqual([NOW, NOW + MIN]);
  });

  it('a large backlog stored after the outage keeps the pause while its measurements are old', () => {
    const phases = run([
      [0, (at) => healthy(at)],
      // Outage: nothing stored for 30 min.
      [30, (at) => rows(10, 30, 30, at)],
      // Storing again, but the backlog is 2 h behind: stored now, measured long ago.
      [31, (at) => rows(10, 0, 120, at)],
      // Longer than the old 15-minute grace period, still behind.
      [60, (at) => rows(10, 0, 70, at)],
      [120, (at) => rows(10, 0, 20, at)],
    ]);
    expect(phases).toEqual([
      [0, 'healthy', false],
      [30, 'outage', true],
      [31, 'catching_up', true],
      [60, 'catching_up', true],
      [120, 'catching_up', true],
    ]);
  });

  it('resumes only when live measurements are back to the healthy share', () => {
    const phases = run([
      [0, (at) => [...rows(9, 1, 1, at), ...rows(1, 1, 300, at)]], // baseline 0.9
      [30, (at) => rows(10, 30, 30, at)],
      // Half caught up: 0.5 < 0.9 - 0.1
      [40, (at) => [...rows(5, 0, 1, at), ...rows(5, 0, 40, at)]],
      // 8 of 10 live: 0.8 >= 0.8 -> resume
      [45, (at) => [...rows(8, 0, 1, at), ...rows(2, 0, 45, at)]],
    ]);
    expect(phases.map(([, p]) => p)).toEqual([
      'healthy',
      'outage',
      'catching_up',
      'healthy',
    ]);
  });

  it('gives up after FLEET.maxCatchUpMs so a lasting problem is not hidden for good', () => {
    const h = FLEET.maxCatchUpMs / MIN;
    const phases = run([
      [0, (at) => healthy(at)],
      [30, (at) => rows(10, 30, 30, at)],
      [31, (at) => rows(10, 0, 60, at)],
      [31 + h, (at) => rows(10, 0, 60, at)],
    ]);
    expect(phases.map(([, p, s]) => [p, s])).toEqual([
      ['healthy', false],
      ['outage', true],
      ['catching_up', true],
      ['gave_up', false],
    ]);
  });

  it('too few installations left while catching up: resume (nothing to judge)', () => {
    const phases = run([
      [0, (at) => healthy(at)],
      [30, (at) => rows(10, 30, 30, at)],
      [31, (at) => rows(2, 0, 60, at)],
    ]);
    expect(phases.map(([, p]) => p)).toEqual(['healthy', 'outage', 'healthy']);
  });

  it('state survives a restart: a stored state resumes the catch-up phase', () => {
    const during = run([
      [0, (at) => healthy(at)],
      [30, (at) => rows(10, 30, 30, at)],
      [31, (at) => rows(10, 0, 90, at)],
    ]);
    expect(during[2][1]).toBe('catching_up');
    // A new process starting from the saved (JSON round-tripped) state.
    let state: FleetState = FLEET_IDLE;
    for (const [min, f] of [
      [0, (at: number) => healthy(at)],
      [30, (at: number) => rows(10, 30, 30, at)],
      [31, (at: number) => rows(10, 0, 90, at)],
    ] as const)
      state = fleetStatus(f(NOW + min * MIN), NOW + min * MIN, state).state;
    const restored = JSON.parse(JSON.stringify(state)) as FleetState;
    const at = NOW + 40 * MIN;
    expect(fleetStatus(rows(10, 0, 50, at), at, restored).phase).toBe(
      'catching_up',
    );
  });

  it('while paused no data incident opens or resolves; low battery and alarms still work', () => {
    const offline = site([sys('a', 90), sys('b', 90, { soc_pct: 5 })]);
    expect(
      conditionsNow(offline, PREFS, [], NOW, T, { suppressData: true }),
    ).toEqual([]);
    const openBefore: OpenIncident[] = [
      { id: 'x', kind: 'OFFLINE', ref: 'a', detail: {} },
    ];
    expect(
      resolutions(offline, openBefore, PREFS, { suppressData: true }),
    ).toEqual([]);
    const live = snap({ soc_pct: 5 }, 1, { alarms: [alarm] });
    expect(
      conditionsNow(live, PREFS, [], NOW, T, { suppressData: true })
        .map((c) => c.kind)
        .sort(),
    ).toEqual(['ALARM', 'LOW_SOC']);
  });

  it('after the pause: no "reporting again" for installations only the outage silenced', () => {
    const back = site([sys('a', 1), sys('b', 1)]);
    expect(resolutions(back, [])).toEqual([]);
    // Offline before the outage and back now: a genuine recovery.
    expect(
      resolutions(back, [{ id: 'x', kind: 'OFFLINE', ref: 'b', detail: {} }]),
    ).toEqual([['OFFLINE', true]]);
  });
});

describe('B: alarms that come and go', () => {
  const ref = alarmRef(alarm);
  const openAlarm = (detail: Record<string, unknown> = {}): OpenIncident => ({
    id: 'x',
    kind: 'ALARM',
    ref,
    detail: { installationId: 'i1', code: 'cell_ov', ...detail },
  });
  const step = (s: SiteSnapshot, open: OpenIncident[], at = NOW) =>
    transition(conditionsNow(s, PREFS, open, at, T), open, s, PREFS, at);

  it('one alert per alarm identity, whatever SolarEvent row represents it', () => {
    const twice = snap({}, 1, {
      alarms: [alarm, { ...alarm, id: 'e2', ts: ago(1) }],
    });
    expect(
      conditionsNow(twice, PREFS, [], NOW).filter((c) => c.kind === 'ALARM'),
    ).toHaveLength(1);
    // Reappearing as a new row with the same identity: already open, nothing new.
    const again = snap({}, 1, { alarms: [{ ...alarm, id: 'e9' }] });
    expect(step(again, [openAlarm()]).open).toEqual([]);
  });

  it('missing from one payload: clear pending, no message', () => {
    const tr = step(snap(), [openAlarm()]);
    expect(tr.resolve).toEqual([]);
    expect(tr.update).toHaveLength(1);
    expect(tr.update[0].detail.absentSince).toBe(NOW);
  });

  it('back in the next payload: still the same alert, the pending clear is cancelled', () => {
    const tr = step(snap({}, 1, { alarms: [{ ...alarm, id: 'e3' }] }), [
      openAlarm({ absentSince: NOW - 2 * 60_000 }),
    ]);
    expect([tr.open, tr.resolve]).toEqual([[], []]);
    expect(tr.update[0].detail.absentSince).toBeNull();
  });

  it('absent for less than alarmClearMs: still open', () => {
    const tr = step(snap(), [
      openAlarm({ absentSince: NOW - (T.alarmClearMs - 60_000) }),
    ]);
    expect([tr.resolve, tr.update]).toEqual([[], []]);
  });

  it('absent long enough while the installation reports: confirmed clear, announced once', () => {
    const tr = step(snap(), [openAlarm({ absentSince: NOW - T.alarmClearMs })]);
    expect(tr.resolve.map((r) => [r.incident.kind, r.announce])).toEqual([
      ['ALARM', true],
    ]);
  });

  it('absent but the installation is not live: no clear, and the pending period is reset', () => {
    const tr = step(snap({}, 30), [
      openAlarm({ absentSince: NOW - 3 * T.alarmClearMs }),
    ]);
    expect(tr.resolve).toEqual([]);
    expect(tr.update[0].detail.absentSince).toBeNull();
  });

  it('M1: offline for two hours, back with one reading without the alarm: no immediate clear', () => {
    const MIN = 60_000;
    let open = [openAlarm()];
    const pass = (
      minutesAfter: number,
      readingMinAgo: number,
      alarms: SnapshotAlarm[] = [],
    ) => {
      const at = NOW + minutesAfter * MIN;
      const s = site(
        [
          {
            ...sys('i1', 0),
            ts: new Date(at - readingMinAgo * MIN).toISOString(),
          },
        ],
        { alarms },
      );
      const tr = transition(
        conditionsNow(s, PREFS, open, at, T),
        open,
        s,
        PREFS,
        at,
      );
      for (const u of tr.update)
        open = open.map((o) =>
          o.id === u.incident.id ? { ...o, detail: u.detail } : o,
        );
      const cleared = tr.resolve.filter((r) => r.announce).length;
      if (tr.resolve.length) open = [];
      return [cleared, open[0]?.detail.absentSince ?? null];
    };
    expect(pass(0, 1, [alarm])).toEqual([0, null]); // present
    expect(pass(1, 1)).toEqual([0, NOW + 1 * MIN]); // absent once, live: pending
    expect(pass(60, 59)).toEqual([0, null]); // offline: reset
    expect(pass(121, 1)).toEqual([0, NOW + 121 * MIN]); // back, one reading: starts again, no clear
    expect(pass(130, 1)).toEqual([0, NOW + 121 * MIN]); // 9 min: still pending
    expect(pass(136, 1)).toEqual([1, null]); // 15 min of live absence: cleared, once
  });

  it('M1: a short live gap inside the period also restarts it', () => {
    let open = [openAlarm({ absentSince: NOW })];
    const s = site([
      { ...sys('i1', 0), ts: new Date(NOW + 4 * 60_000).toISOString() },
    ]);
    const at = NOW + 10 * 60_000; // reading 6 min old: not live
    const tr = transition(
      conditionsNow(s, PREFS, open, at, T),
      open,
      s,
      PREFS,
      at,
    );
    open = open.map((o) => ({
      ...o,
      detail: tr.update[0]?.detail ?? o.detail,
    }));
    expect([tr.resolve, open[0].detail.absentSince]).toEqual([[], null]);
  });

  it('an intermittent alarm list over several passes sends no alert/clear pairs', () => {
    let open: OpenIncident[] = [];
    const sent: string[] = [];
    for (let i = 0; i < 12; i++) {
      const at = NOW + i * 5 * 60_000; // one pass every 5 min, alarm in every second payload
      const s = site(
        [{ ...sys('i1', 0), ts: new Date(at - 60_000).toISOString() }],
        {
          alarms: i % 2 === 0 ? [{ ...alarm, id: `e${i}` }] : [],
        },
      );
      const tr = transition(
        conditionsNow(s, PREFS, open, at, T),
        open,
        s,
        PREFS,
        at,
      );
      tr.open.forEach(() => sent.push('alert'));
      tr.resolve.filter((r) => r.announce).forEach(() => sent.push('cleared'));
      const resolved = new Set(tr.resolve.map((r) => r.incident.id));
      open = [
        ...open
          .filter((o) => !resolved.has(o.id))
          .map((o) => {
            const u = tr.update.find((x) => x.incident.id === o.id);
            return u ? { ...o, detail: u.detail } : o;
          }),
        ...tr.open.map((c, k) => ({
          id: `n${i}-${k}`,
          kind: c.kind,
          ref: c.ref,
          detail: c.detail,
        })),
      ];
    }
    expect(sent).toEqual(['alert']);
  });
});

describe('texts never invent values', () => {
  it('status shows reported values, the reading time and "not reported" for the rest', () => {
    const text = statusText(snap(), NOW);
    expect(text).toContain('🟢 Live');
    expect(text).toContain('Oct 2026');
    expect(text).toContain('🔌 Grid: not reported');
    expect(text).toContain('discharging 1.20 kW');
  });

  it('delayed and unavailable sites say so explicitly', () => {
    expect(statusText(snap({}, 30), NOW)).toContain('Delayed');
    expect(statusText(empty(), NOW)).toContain('has not reported any reading');
    expect(batteryText(empty(), NOW)).not.toMatch(/\d+%/);
  });

  it('battery text uses the battery bank when there is no system value', () => {
    const s = site([
      {
        installationId: 'i1',
        kind: 'BATTERY',
        externalId: 'bank',
        ts: ago(1),
        metrics: {
          soc_pct: 43,
          power_w: 900,
          voltage_v: 52.3,
          charge_capacity_kwh: 39,
          capacity_kwh: 90,
        },
      },
    ]);
    const t = batteryText(s, NOW);
    expect(t).toContain('State of charge: 43%');
    expect(t).toContain('charging 900 W');
    expect(t).toContain('39.0 kWh of 90.0 kWh');
    expect(t).toContain('Temperature: not reported');
  });
});

describe('Telegram API client', () => {
  const failure = (p: Promise<unknown>) =>
    p.then(
      () => {
        throw new Error('expected a failure');
      },
      (e: TelegramApiError) => e,
    );
  const api = (status: number, body: unknown, throws?: Error) =>
    new TelegramApi(
      { token: 'SECRET-TOKEN-123', apiUrl: 'https://tg.test' },
      async () => {
        if (throws) throw throws;
        return new Response(JSON.stringify(body), { status });
      },
    );

  it('returns the result on success', async () => {
    await expect(
      api(200, { ok: true, result: { message_id: 1 } }).sendMessage('1', 'hi'),
    ).resolves.toEqual({ message_id: 1 });
  });

  it('429 carries retry_after and is not permanent; 403 is permanent', async () => {
    const e429 = await failure(
      api(429, {
        ok: false,
        description: 'Too Many Requests',
        parameters: { retry_after: 7 },
      }).sendMessage('1', 'x'),
    );
    expect(e429).toBeInstanceOf(TelegramApiError);
    expect([e429.retryAfter, e429.permanent]).toEqual([7, false]);
    const e403 = await failure(
      api(403, {
        ok: false,
        description: 'Forbidden: bot was blocked by the user',
      }).sendMessage('1', 'x'),
    );
    expect([e403.status, e403.permanent]).toEqual([403, true]);
  });

  it('a timeout is transient, and no error ever contains the token', async () => {
    const timeout = Object.assign(new Error('x'), { name: 'TimeoutError' });
    const e = await failure(api(0, null, timeout).sendMessage('1', 'x'));
    expect([e.permanent, e.message]).toEqual([false, 'sendMessage: timed out']);
    const e5 = await failure(api(502, { ok: false }).sendMessage('1', 'x'));
    for (const err of [e, e5])
      expect(err.message).not.toContain('SECRET-TOKEN-123');
  });
});

describe('configuration', () => {
  it('off by default, and off when the token or a valid webhook secret is missing', () => {
    expect(telegramConfig({}).enabled).toBe(false);
    expect(telegramConfig({ TELEGRAM_ENABLED: 'true' }).enabled).toBe(false);
    expect(
      telegramConfig({
        TELEGRAM_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: 't',
        TELEGRAM_WEBHOOK_SECRET: 'short',
      }).enabled,
    ).toBe(false);
    const on = telegramConfig({
      TELEGRAM_ENABLED: 'true',
      TELEGRAM_BOT_TOKEN: 't',
      TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32),
    });
    expect([on.enabled, on.notificationsEnabled]).toEqual([true, false]);
    expect(
      telegramConfig({
        TELEGRAM_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: 't',
        TELEGRAM_MODE: 'polling',
        TELEGRAM_NOTIFICATIONS_ENABLED: 'true',
      }).notificationsEnabled,
    ).toBe(true);
    expect(DEFAULT_THRESHOLDS.staleMs).toBe(15 * 60_000);
    // Never earlier than the outage check (dashboard "delayed" after 5 min).
    expect(telegramConfig({ TELEGRAM_STALE_MINUTES: '3' }).staleMs).toBe(
      15 * 60_000,
    );
    expect(
      telegramConfig({
        TELEGRAM_STALE_MINUTES: '30',
        TELEGRAM_OFFLINE_MINUTES: '10',
      }).offlineMs,
    ).toBe(30 * 60_000);
  });
});
