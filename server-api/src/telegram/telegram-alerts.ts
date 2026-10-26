import { LIVE_STALE_MS } from 'src/solar/solar.keys';

/**
 * Telegram alerts and status texts — pure functions, no I/O.
 *
 * Everything shown comes from a SiteSnapshot built from the real SolarBMS read
 * model (SolarReadService.latest + active SolarEvent rows). A value the system
 * did not report is `null` and is shown as "not reported", never estimated.
 *
 * Three different situations are kept apart, in wording and in alert kind:
 *   ALARM        the system itself reported an alarm (SolarEvent, active)
 *   STALE        an installation's readings are older than the stale threshold
 *   OFFLINE      an installation has not reported for longer than the offline threshold
 *   UNAVAILABLE  an installation has never reported any reading
 *
 * Data conditions are judged per installation, so a quiet installation is
 * never hidden by another one that keeps reporting. Values follow the
 * dashboard (offsettingdashboard/src/features/solar/model.ts `headline`): a
 * device is live while its reading is at most LIVE_STALE_MS old, and when any
 * device is live only live devices count.
 */

export interface SnapshotDevice {
  installationId: string;
  kind: 'SYSTEM' | 'INVERTER' | 'BATTERY' | 'BMS';
  externalId: string;
  ts: string;
  metrics: Record<string, unknown>;
}

export interface SnapshotAlarm {
  id: string;
  installationId: string;
  deviceKind: string | null;
  deviceExternalId: string | null;
  severity: string;
  code: string | null;
  message: string;
  ts: string;
}

export interface SiteSnapshot {
  siteId: string;
  siteName: string;
  timezone: string | null;
  /** Timestamp of the newest reading, or null when the site never reported. */
  updatedAt: string | null;
  installations: SnapshotInstallation[];
  devices: SnapshotDevice[];
  alarms: SnapshotAlarm[];
}

export interface SnapshotInstallation {
  id: string;
  name: string;
  /** Inactive installations are not watched for missing data. */
  active: boolean;
}

export interface AlertPrefs {
  lowSocPct: number;
  notifyLowSoc: boolean;
  notifyOffline: boolean;
  notifyStale: boolean;
  notifyAlarms: boolean;
  notifyRecovery: boolean;
}

export interface Thresholds {
  /** A device reading older than this is "delayed" (the dashboard's rule). */
  deviceStaleMs: number;
  staleMs: number;
  offlineMs: number;
  /** LOW_SOC resolves only once SoC is this many points above the threshold. */
  socHysteresisPct: number;
  /** An alarm counts as cleared only after it stayed absent this long while its installation reported. */
  alarmClearMs: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  deviceStaleMs: LIVE_STALE_MS,
  staleMs: 15 * 60_000,
  offlineMs: 60 * 60_000,
  socHysteresisPct: 5,
  alarmClearMs: 15 * 60_000,
};

export type AlertKind =
  | 'LOW_SOC'
  | 'STALE'
  | 'OFFLINE'
  | 'UNAVAILABLE'
  | 'ALARM';

export interface Condition {
  kind: AlertKind;
  /** Distinguishes several conditions of one kind: installation id, alarm identity (alarmRef). */
  ref?: string;
  detail: Record<string, unknown>;
}

export interface OpenIncident {
  id: string;
  kind: AlertKind;
  ref?: string;
  detail: Record<string, unknown>;
}

export type Freshness = 'fresh' | 'stale' | 'offline' | 'unavailable';

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

const ageOf = (ts: string, now: number) => now - Date.parse(ts);

/** The dashboard's per-device rule: live while at most deviceStaleMs old. */
const isLive = (d: SnapshotDevice, now: number, t: Thresholds) =>
  ageOf(d.ts, now) <= t.deviceStaleMs;

/** Device kinds the dashboard's headline values come from. */
const HEADLINE_KINDS = new Set(['SYSTEM', 'INVERTER', 'BATTERY']);

/**
 * The devices values are taken from, as on the dashboard: when any device is
 * live only live ones count; when none is, the last known readings are used
 * (and labelled as delayed).
 */
function headlineDevices(s: SiteSnapshot, now: number, t: Thresholds) {
  const all = s.devices.filter((d) => HEADLINE_KINDS.has(d.kind));
  const anyLive = all.some((d) => isLive(d, now, t));
  return anyLive ? all.filter((d) => isLive(d, now, t)) : all;
}

/** Site label for texts: "fresh" means at least one device is live (dashboard: "Live"). */
export function freshness(
  s: SiteSnapshot,
  now: number,
  t = DEFAULT_THRESHOLDS,
): Freshness {
  if (!s.updatedAt) return 'unavailable';
  if (s.devices.some((d) => isLive(d, now, t))) return 'fresh';
  return ageOf(s.updatedAt, now) > t.offlineMs ? 'offline' : 'stale';
}

/** Newest reading of one installation, or null if it never reported. */
function newestOf(s: SiteSnapshot, installationId: string): string | null {
  return s.devices
    .filter((d) => d.installationId === installationId)
    .reduce<string | null>((a, d) => (!a || d.ts > a ? d.ts : a), null);
}

/** Does the installation report live data now (any device at most deviceStaleMs old, the dashboard's "Live")? */
export function installationLive(
  s: SiteSnapshot,
  installationId: string,
  now: number,
  t = DEFAULT_THRESHOLDS,
): boolean {
  return s.devices.some(
    (d) => d.installationId === installationId && isLive(d, now, t),
  );
}

/** One installation, by the alert thresholds (staleMs / offlineMs). */
export function installationFreshness(
  s: SiteSnapshot,
  installationId: string,
  now: number,
  t = DEFAULT_THRESHOLDS,
): Freshness {
  const newest = newestOf(s, installationId);
  if (!newest) return 'unavailable';
  const age = ageOf(newest, now);
  if (age > t.offlineMs) return 'offline';
  if (age > t.staleMs) return 'stale';
  return 'fresh';
}

const sumOf = (list: SnapshotDevice[], ...keys: string[]) => {
  const v = list
    .map((d) => keys.map((k) => num(d.metrics[k])).find((x) => x != null))
    .filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

/** Battery figures as reported; null for anything not reported. */
export function batteryFigures(
  s: SiteSnapshot,
  now: number,
  t = DEFAULT_THRESHOLDS,
  devices = headlineDevices(s, now, t),
) {
  const systems = devices.filter((d) => d.kind === 'SYSTEM');
  const banks = devices.filter((d) => d.kind === 'BATTERY');
  const fromSystems = (k: string) => avg(systems.map((d) => num(d.metrics[k])));
  const fromBanks = (...keys: string[]) =>
    avg(
      banks.map(
        (d) =>
          keys.map((k) => num(d.metrics[k])).find((v) => v != null) ?? null,
      ),
    );
  return {
    socPct: fromSystems('soc_pct') ?? fromBanks('soc_pct'),
    /** + = charging, − = discharging (confirmed convention). */
    powerW:
      sumOf(systems, 'battery_power_w') ??
      sumOf(banks, 'power_w', 'battery_power_w'),
    voltageV:
      fromBanks('voltage_v', 'battery_voltage_v') ??
      fromSystems('battery_voltage_v'),
    temperatureC:
      fromBanks('temperature_c', 'battery_temperature_c') ??
      fromSystems('battery_temperature_c'),
    remainingKwh: fromBanks('charge_capacity_kwh', 'remaining_capacity_kwh'),
    capacityKwh: fromBanks('capacity_kwh', 'full_capacity_kwh'),
  };
}

/** State of charge from live devices only; null when no live device reports one. */
export function liveSocPct(
  s: SiteSnapshot,
  now: number,
  t = DEFAULT_THRESHOLDS,
) {
  return batteryFigures(
    s,
    now,
    t,
    s.devices.filter((d) => HEADLINE_KINDS.has(d.kind) && isLive(d, now, t)),
  ).socPct;
}

export function powerFigures(
  s: SiteSnapshot,
  now: number,
  t = DEFAULT_THRESHOLDS,
) {
  const devices = headlineDevices(s, now, t);
  const systems = devices.filter((d) => d.kind === 'SYSTEM');
  const inverters = devices.filter((d) => d.kind === 'INVERTER');
  return {
    pvW: sumOf(systems, 'pv_power_w') ?? sumOf(inverters, 'pv_power_w'),
    loadW: sumOf(systems, 'load_power_w'),
    /** + = import, − = export (confirmed convention). One inverter's reading is the site's. */
    gridW:
      sumOf(systems, 'grid_power_w') ??
      (inverters.length === 1 ? sumOf(inverters, 'grid_power_w') : null),
  };
}

/** Active installations with no live device while another one is live (left out of the values). */
function delayedInstallations(
  s: SiteSnapshot,
  now: number,
  t: Thresholds,
): SnapshotInstallation[] {
  const devices = s.devices.filter((d) => HEADLINE_KINDS.has(d.kind));
  if (!devices.some((d) => isLive(d, now, t))) return [];
  return s.installations.filter(
    (i) =>
      i.active &&
      devices.some((d) => d.installationId === i.id) &&
      !devices.some((d) => d.installationId === i.id && isLive(d, now, t)),
  );
}

const alarmSeverity = new Set(['ALARM', 'CRITICAL']);

/**
 * Stable identity of an alarm: the same alarm on the same device, whichever
 * SolarEvent row currently represents it (the store writes a new row each time
 * an alarm reappears after a clear). Same parts as the store's own alarm id.
 */
export const alarmRef = (a: SnapshotAlarm) =>
  [
    a.installationId,
    a.deviceKind ?? '',
    a.deviceExternalId ?? '',
    a.code ?? a.message,
  ].join('|');

const DATA_KINDS: AlertKind[] = ['STALE', 'OFFLINE', 'UNAVAILABLE'];

export interface EvaluateOptions {
  /**
   * A likely Carbonoz-side outage (see fleetStatus): no data incident is
   * opened or resolved; open ones stay as they are until it is over.
   */
  suppressData?: boolean;
}

/**
 * The conditions that hold now. `open` is consulted for hysteresis and to keep
 * what cannot be judged now: a low SoC stays as it was while no live device
 * reports one.
 */
export function conditionsNow(
  s: SiteSnapshot,
  prefs: AlertPrefs,
  open: OpenIncident[],
  now: number,
  t = DEFAULT_THRESHOLDS,
  opts: EvaluateOptions = {},
): Condition[] {
  const out: Condition[] = [];
  const keepOpen = (kind: AlertKind) => open.filter((o) => o.kind === kind);

  if (opts.suppressData) {
    for (const k of DATA_KINDS) out.push(...keepOpen(k));
  } else {
    for (const i of s.installations.filter((x) => x.active)) {
      const f = installationFreshness(s, i.id, now, t);
      const newest = newestOf(s, i.id);
      const detail = {
        installationId: i.id,
        installationName: i.name,
        updatedAt: newest,
        ageMs: newest ? ageOf(newest, now) : null,
      };
      if (f === 'unavailable' && prefs.notifyOffline)
        out.push({ kind: 'UNAVAILABLE', ref: i.id, detail });
      if (f === 'offline' && prefs.notifyOffline)
        out.push({ kind: 'OFFLINE', ref: i.id, detail });
      if (f === 'stale' && prefs.notifyStale)
        out.push({ kind: 'STALE', ref: i.id, detail });
    }
  }

  if (prefs.notifyLowSoc) {
    // Only live readings: a quiet installation's old SoC never raises an alert.
    const soc = liveSocPct(s, now, t);
    const wasLow = keepOpen('LOW_SOC');
    if (soc == null) {
      out.push(...wasLow); // unknown now, not recovered
    } else {
      const opened = wasLow[0]?.detail.thresholdPct;
      const limit = wasLow.length
        ? (typeof opened === 'number' ? opened : prefs.lowSocPct) +
          t.socHysteresisPct
        : prefs.lowSocPct;
      // Still low by the threshold it was opened with, or newly at/below the current one.
      if (wasLow.length ? soc < limit || soc <= prefs.lowSocPct : soc <= limit)
        out.push(
          wasLow.length
            ? wasLow[0]
            : {
                kind: 'LOW_SOC',
                detail: {
                  socPct: soc,
                  thresholdPct: prefs.lowSocPct,
                  updatedAt: s.updatedAt,
                },
              },
        );
    }
  }

  if (prefs.notifyAlarms) {
    // One condition per alarm identity, however many rows represent it.
    const active = new Map<string, SnapshotAlarm>();
    for (const a of s.alarms.filter((x) => alarmSeverity.has(x.severity)))
      if (!active.has(alarmRef(a))) active.set(alarmRef(a), a);
    for (const [ref, a] of active)
      out.push({
        kind: 'ALARM',
        ref,
        detail: {
          installationId: a.installationId,
          severity: a.severity,
          code: a.code,
          message: a.message,
          ts: a.ts,
          absentSince: null,
        },
      });
    // An open alarm missing from the active list is cleared only once it stayed
    // absent for alarmClearMs WHILE its installation reported live data the
    // whole time: a payload that omits its alarm list now and then, or one
    // reading after a gap, is not a recovery. Not live = no evidence: the
    // confirmation period starts again when live data returns.
    for (const o of keepOpen('ALARM')) {
      if (active.has(o.ref ?? '')) continue;
      const since = o.detail.absentSince;
      const live = installationLive(
        s,
        String(o.detail.installationId ?? ''),
        now,
        t,
      );
      if (!live)
        out.push(
          typeof since === 'number'
            ? { ...o, detail: { ...o.detail, absentSince: null } }
            : o,
        );
      else if (typeof since !== 'number')
        out.push({ ...o, detail: { ...o.detail, absentSince: now } });
      else if (now - since < t.alarmClearMs) out.push(o);
    }
  }
  return out.map(({ kind, ref, detail }) => ({
    kind,
    ...(ref && { ref }),
    detail,
  }));
}

export interface Transition {
  open: Condition[];
  resolve: { incident: OpenIncident; announce: boolean }[];
  /** Open incidents whose stored detail changes (alarm clear pending / reappeared). */
  update: { incident: OpenIncident; detail: Record<string, unknown> }[];
}

const keyOf = (c: { kind: AlertKind; ref?: string }) =>
  `${c.kind}:${c.ref ?? ''}`;

/**
 * Did the condition behind an open incident genuinely clear? Closing for any
 * other reason (alert type switched off, threshold changed, site deselected,
 * STALE turning into OFFLINE, installation deactivated) is silent.
 */
function recovered(
  i: OpenIncident,
  s: SiteSnapshot,
  prefs: AlertPrefs,
  at: number,
  t: Thresholds,
): boolean {
  switch (i.kind) {
    case 'LOW_SOC': {
      if (!prefs.notifyLowSoc) return false;
      const soc = liveSocPct(s, at, t);
      const opened = i.detail.thresholdPct;
      return (
        soc != null &&
        typeof opened === 'number' &&
        soc >= opened + t.socHysteresisPct
      );
    }
    case 'ALARM': {
      // Confirmed clear only (see conditionsNow): absent long enough while live, not active now.
      const since = i.detail.absentSince;
      return (
        prefs.notifyAlarms &&
        typeof since === 'number' &&
        at - since >= t.alarmClearMs &&
        installationLive(s, String(i.detail.installationId ?? ''), at, t) &&
        !s.alarms.some(
          (a) => alarmSeverity.has(a.severity) && alarmRef(a) === i.ref,
        )
      );
    }
    case 'STALE':
    case 'OFFLINE':
    case 'UNAVAILABLE': {
      const enabled =
        i.kind === 'STALE' ? prefs.notifyStale : prefs.notifyOffline;
      const inst = s.installations.find((x) => x.id === i.ref && x.active);
      return (
        enabled &&
        !!inst &&
        installationFreshness(s, inst.id, at, t) === 'fresh'
      );
    }
  }
}

/** New incidents to open and open ones to resolve, with or without a recovery message. */
export function transition(
  now: Condition[],
  open: OpenIncident[],
  s: SiteSnapshot,
  prefs: AlertPrefs,
  at: number,
  t = DEFAULT_THRESHOLDS,
): Transition {
  const nowKeys = new Set(now.map(keyOf));
  const openByKey = new Map(open.map((o) => [keyOf(o), o]));
  const update: Transition['update'] = [];
  for (const c of now) {
    const o = openByKey.get(keyOf(c));
    if (
      o &&
      c.kind === 'ALARM' &&
      (o.detail.absentSince ?? null) !== (c.detail.absentSince ?? null)
    )
      update.push({ incident: o, detail: c.detail });
  }
  return {
    update,
    open: now.filter((c) => !openByKey.has(keyOf(c))),
    resolve: open
      .filter((o) => !nowKeys.has(keyOf(o)))
      .map((incident) => ({
        incident,
        announce: prefs.notifyRecovery && recovered(incident, s, prefs, at, t),
      })),
  };
}

/**
 * Carbonoz-side outage detection, from two times the platform keeps per
 * installation (no new fields):
 *
 *   storedAt    Installation.lastSeenAt: server time the platform last STORED
 *               a reading (any reading, also old backlog)
 *   measuredAt  newest SolarDevice.lastSeenAt: the newest MEASUREMENT time
 *               stored (forward-only; future timestamps clamped at ingestion)
 *
 *   population  active installations stored within FLEET.lookbackMs
 *   start       population >= FLEET.minInstallations and at least
 *               FLEET.quietShare of it not stored for over deviceStaleMs
 *               (before any STALE alert can go out)
 *   recovered   storing again AND the share of the population with a live
 *               measurement (<= deviceStaleMs) is back to the baseline, minus
 *               FLEET.recoveryTolerance. Old backlog being stored does not
 *               count: its measurements are old.
 *   give up     still not recovered FLEET.maxCatchUpMs after storing FIRST
 *               resumed in this incident (a relapse into outage does not
 *               restart the limit): alerts resume (logged), so a lasting
 *               problem is not hidden.
 *   baseline    the lowest live share over a full FLEET.settleMs of steady
 *               passes (few stored-quiet AND few lagging installations), only
 *               sampled from FLEET.settleMs after alerts resumed. Passes right
 *               after a recovery, or a fleet still behind after a give-up, are
 *               never steady, so they cannot lower it.
 *
 * Too small a population says nothing: no pause, individual alerts as usual.
 */
export const FLEET = {
  lookbackMs: 7 * 24 * 3600_000,
  minInstallations: 3,
  quietShare: 0.8,
  /** Steady pass: stored-quiet share AND lagging share (stored now, measured long ago) below this. */
  healthyQuietShare: 0.2,
  /** Wait after a resume, and length of the steady run, before the baseline is (re)set. */
  settleMs: 3600_000,
  recoveryTolerance: 0.1,
  /** Assumed live share when no healthy baseline was seen yet. */
  unknownBaselineLiveShare: 0.8,
  maxCatchUpMs: 6 * 3600_000,
};

export interface FleetRow {
  storedAt: number | null;
  measuredAt: number | null;
}

export interface FleetState {
  suspectedSince: number | null;
  /** When storing FIRST resumed in this incident (kept through a relapse), else null. */
  storingSince: number | null;
  /** Live-measurement share of the population in steady operation. */
  baselineLiveShare: number | null;
  /** When alerts last resumed (caught up or gave up). */
  resumedAt: number | null;
  /** Current run of steady passes, and its lowest live share. */
  steadySince: number | null;
  steadyMin: number | null;
  /** When this state was computed: orders the Redis and in-memory copies. */
  updatedAt: number;
}

export const FLEET_IDLE: FleetState = {
  suspectedSince: null,
  storingSince: null,
  baselineLiveShare: null,
  resumedAt: null,
  steadySince: null,
  steadyMin: null,
  updatedAt: 0,
};

export type FleetPhase = 'healthy' | 'outage' | 'catching_up' | 'gave_up';

export function fleetStatus(
  rows: FleetRow[],
  now: number,
  prev: FleetState,
  t = DEFAULT_THRESHOLDS,
): {
  suppress: boolean;
  phase: FleetPhase;
  liveShare: number | null;
  state: FleetState;
} {
  const population = rows.filter(
    (r) => r.storedAt != null && now - r.storedAt <= FLEET.lookbackMs,
  );
  const n = population.length;
  const enough = n >= FLEET.minInstallations;
  const storedLive = (r: FleetRow) =>
    now - (r.storedAt as number) <= t.deviceStaleMs;
  const measuredLive = (r: FleetRow) =>
    r.measuredAt != null && now - r.measuredAt <= t.deviceStaleMs;
  const storedQuiet = population.filter((r) => !storedLive(r)).length;
  const lagging = population.filter(
    (r) => storedLive(r) && !measuredLive(r),
  ).length;
  const live = population.filter(measuredLive).length;
  const liveShare = n ? live / n : null;
  const baseline = prev.baselineLiveShare;
  const keep = {
    baselineLiveShare: baseline,
    resumedAt: prev.resumedAt,
    updatedAt: now,
  };
  const noRun = { steadySince: null, steadyMin: null };

  if (enough && storedQuiet >= Math.ceil(FLEET.quietShare * n))
    return {
      suppress: true,
      phase: 'outage',
      liveShare,
      state: {
        ...keep,
        ...noRun,
        suspectedSince: prev.suspectedSince ?? now,
        storingSince: prev.storingSince,
      },
    };

  if (prev.suspectedSince != null) {
    const storingSince = prev.storingSince ?? now;
    // Unknown baseline (never seen steady): expect most of the fleet live again.
    const target =
      (baseline ?? FLEET.unknownBaselineLiveShare) - FLEET.recoveryTolerance;
    // Too few installations left to judge: resume, as when there never were enough.
    const caughtUp = !enough || (liveShare != null && liveShare >= target);
    const gaveUp = !caughtUp && now - storingSince >= FLEET.maxCatchUpMs;
    if (!caughtUp && !gaveUp)
      return {
        suppress: true,
        phase: 'catching_up',
        liveShare,
        state: {
          ...keep,
          ...noRun,
          suspectedSince: prev.suspectedSince,
          storingSince,
        },
      };
    return {
      suppress: false,
      phase: gaveUp ? 'gave_up' : 'healthy',
      liveShare,
      state: { ...FLEET_IDLE, ...keep, resumedAt: now },
    };
  }

  // Baseline: lowest live share over a full settle period of steady passes,
  // starting no earlier than settleMs after the last resume.
  const steady =
    enough &&
    liveShare != null &&
    storedQuiet < Math.ceil(FLEET.healthyQuietShare * n) &&
    lagging < Math.ceil(FLEET.healthyQuietShare * n);
  const settled =
    prev.resumedAt == null || now - prev.resumedAt >= FLEET.settleMs;
  let next = { baseline, ...noRun } as {
    baseline: number | null;
    steadySince: number | null;
    steadyMin: number | null;
  };
  if (steady && settled) {
    const since = prev.steadySince ?? now;
    const min = Math.min(prev.steadyMin ?? 1, liveShare as number);
    next =
      now - since >= FLEET.settleMs
        ? { baseline: min, steadySince: now, steadyMin: liveShare }
        : { baseline, steadySince: since, steadyMin: min };
  }
  return {
    suppress: false,
    phase: 'healthy',
    liveShare,
    state: {
      ...FLEET_IDLE,
      ...keep,
      baselineLiveShare: next.baseline,
      steadySince: next.steadySince,
      steadyMin: next.steadyMin,
    },
  };
}

// --- texts ---------------------------------------------------------------

export function formatTime(iso: string, tz: string | null): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: tz ?? 'UTC',
      timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function formatAge(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min ago`;
  return `${Math.floor(h / 24)} days ago`;
}

const kw = (w: number) =>
  Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${Math.round(w)} W`;
const NR = 'not reported';

export function freshnessLine(
  s: SiteSnapshot,
  now: number,
  t = DEFAULT_THRESHOLDS,
): string {
  const f = freshness(s, now, t);
  if (f === 'unavailable')
    return '⚪ No data: this site has not reported any reading yet.';
  const when = `${formatTime(s.updatedAt as string, s.timezone)} (${formatAge(
    now - Date.parse(s.updatedAt as string),
  )})`;
  if (f === 'fresh') return `🟢 Live · last reading ${when}`;
  if (f === 'stale')
    return `🟡 Delayed · last reading ${when}. Values below may be out of date.`;
  return `🔴 Offline · last reading ${when}. Values below are the last known ones.`;
}

/** "Delayed: <name> (last reading …)" for installations left out of the values. */
function delayedLines(s: SiteSnapshot, now: number, t: Thresholds): string[] {
  return delayedInstallations(s, now, t).map((i) => {
    const newest = newestOf(s, i.id) as string;
    return `⚠️ ${i.name} is delayed (last reading ${formatTime(
      newest,
      s.timezone,
    )}) and is not included above.`;
  });
}

export function statusText(
  s: SiteSnapshot,
  now: number,
  t = DEFAULT_THRESHOLDS,
): string {
  const lines = [`📍 ${s.siteName}`, freshnessLine(s, now, t)];
  if (!s.updatedAt) return lines.join('\n');
  const p = powerFigures(s, now, t);
  const b = batteryFigures(s, now, t);
  lines.push(
    '',
    `☀️ Solar: ${p.pvW == null ? NR : kw(p.pvW)}`,
    `🏠 Home: ${p.loadW == null ? NR : kw(p.loadW)}`,
    `🔌 Grid: ${
      p.gridW == null
        ? NR
        : `${kw(Math.abs(p.gridW))}${
            Math.abs(p.gridW) > 20
              ? p.gridW > 0
                ? ' importing'
                : ' exporting'
              : ''
          }`
    }`,
    `🔋 Battery: ${b.socPct == null ? NR : `${Math.round(b.socPct)}%`}${
      b.powerW == null ? '' : ` · ${batteryDirection(b.powerW)}`
    }`,
    ...delayedLines(s, now, t),
  );
  const alarms = s.alarms.filter((a) => alarmSeverity.has(a.severity));
  lines.push(
    alarms.length
      ? `🚨 Active alarms: ${alarms.length}, details on the dashboard`
      : '✅ No active alarms',
  );
  return lines.join('\n');
}

function batteryDirection(w: number) {
  if (Math.abs(w) <= 20) return 'idle';
  return `${w > 0 ? 'charging' : 'discharging'} ${kw(Math.abs(w))}`;
}

export function batteryText(
  s: SiteSnapshot,
  now: number,
  t = DEFAULT_THRESHOLDS,
): string {
  const lines = [`🔋 ${s.siteName}`, freshnessLine(s, now, t)];
  if (!s.updatedAt) return lines.join('\n');
  const b = batteryFigures(s, now, t);
  lines.push(
    '',
    `State of charge: ${b.socPct == null ? NR : `${Math.round(b.socPct)}%`}`,
    `Power: ${b.powerW == null ? NR : batteryDirection(b.powerW)}`,
    `Voltage: ${b.voltageV == null ? NR : `${b.voltageV.toFixed(1)} V`}`,
    `Temperature: ${
      b.temperatureC == null ? NR : `${b.temperatureC.toFixed(1)} °C`
    }`,
    `Stored energy: ${
      b.remainingKwh == null ? NR : `${b.remainingKwh.toFixed(1)} kWh`
    }${b.capacityKwh == null ? '' : ` of ${b.capacityKwh.toFixed(1)} kWh`}`,
    ...delayedLines(s, now, t),
  );
  return lines.join('\n');
}

/** The site, plus the installation when the site has more than one. */
function where(s: SiteSnapshot, detail: Record<string, unknown>) {
  const several = s.installations.filter((i) => i.active).length > 1;
  return several && detail.installationName
    ? `${s.siteName} – ${detail.installationName}`
    : s.siteName;
}

export function openText(c: Condition, s: SiteSnapshot): string {
  const site = s.siteName;
  const at = where(s, c.detail);
  switch (c.kind) {
    case 'LOW_SOC':
      return `🔋 Low battery at ${site}: ${Math.round(
        c.detail.socPct as number,
      )}% (your threshold ${c.detail.thresholdPct}%).\nReading ${formatTime(
        c.detail.updatedAt as string,
        s.timezone,
      )}.`;
    case 'STALE':
      return `🟡 Data delayed at ${at}: no new reading since ${formatTime(
        c.detail.updatedAt as string,
        s.timezone,
      )}. This is a data warning, not an alarm from the system.`;
    case 'OFFLINE':
      return `🔴 ${at} is offline: no reading since ${formatTime(
        c.detail.updatedAt as string,
        s.timezone,
      )}. The installation or its connection may be down.`;
    case 'UNAVAILABLE':
      return `⚪ No data from ${at}: it has not reported any reading yet.`;
    case 'ALARM':
      return `🚨 Alarm at ${site} (${String(c.detail.severity).toLowerCase()}${
        c.detail.code ? `, ${c.detail.code}` : ''
      }): ${c.detail.message}\nReported ${formatTime(
        c.detail.ts as string,
        s.timezone,
      )}.`;
  }
}

export function resolvedText(
  i: OpenIncident,
  s: SiteSnapshot,
  now: number,
  t = DEFAULT_THRESHOLDS,
): string {
  const site = s.siteName;
  switch (i.kind) {
    case 'LOW_SOC': {
      const soc = liveSocPct(s, now, t);
      return `✅ Battery at ${site} recovered${
        soc == null ? '' : `: ${Math.round(soc)}%`
      }.`;
    }
    case 'ALARM':
      return `✅ Alarm cleared at ${site}${
        i.detail.code ? ` (${i.detail.code})` : ''
      }.`;
    default:
      return `✅ ${where(s, i.detail)} is reporting again. ${freshnessLine(
        s,
        now,
        t,
      )}`;
  }
}
