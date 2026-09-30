/** Redis keys used by the SolarBMS pipeline, in one place. */
export const SolarKeys = {
  group: 'solar-store',
  seen: (installationId: string, messageId: string) =>
    `solar:seen:${installationId}:${messageId}`,
  /** Hash per installation: `<KIND>:<externalId>` → latest sample JSON, plus `_meta`. */
  live: (siteId: string, installationId: string) =>
    `solar:live:${siteId}:${installationId}`,
  /** Set per installation of `<KIND>|<externalId>|<code>` alarms currently active. */
  alarms: (siteId: string, installationId: string) =>
    `solar:alarms:${siteId}:${installationId}`,
  /** Hash per installation: `<KIND>|<externalId>` → ts of the reading the alarm state reflects. */
  alarmState: (siteId: string, installationId: string) =>
    `solar:alarmts:${siteId}:${installationId}`,
  /** Held while one worker processes a stream entry (prevents concurrent duplicates). */
  lock: (streamId: string) => `solar:lock:${streamId}`,
  /** Fallback dead-letter stream, used when MongoDB can't take the record. */
  deadLetters: 'solar:ingest:dead',
  /** Set of `<KIND>|<metricKey>` already in the SolarMetric catalogue. */
  metrics: (siteId: string) => `solar:metrics:${siteId}`,
  /** Set while the metric catalogue's lastSeenAt was refreshed recently. */
  metricsTouched: (siteId: string) => `solar:metrics-touched:${siteId}`,
  /** Changes whenever the worker drops cached energy days of a site (cache-write guard). */
  energyDirty: (siteId: string) => `solar:energy-dirty:${siteId}`,
  /** Hash per installation: accepted / duplicate counters (admin monitoring only). */
  stats: (installationId: string) => `solar:stats:${installationId}`,
};

/** SolarMetric.lastSeenAt is refreshed at most this often per site. */
export const METRIC_TOUCH_SECONDS = 3600;

/** A reading older than this is "delayed"; an installation without one is offline. */
export const LIVE_STALE_MS = 5 * 60_000;

export const DEDUPE_TTL_SECONDS = 24 * 3600;
/** Distinct metric names catalogued per site; beyond this new names stay in the raw payload only. */
export const MAX_METRICS_PER_SITE = 2000;
