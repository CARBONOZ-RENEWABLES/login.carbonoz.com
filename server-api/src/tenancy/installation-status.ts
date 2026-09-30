import { LIVE_STALE_MS } from 'src/solar/solar.keys';

export type LiveStatus = 'online' | 'offline' | 'never' | 'inactive';

/** Installation connectivity as the admin panel shows it. */
export function installationStatus(
  i: { active: boolean; lastSeenAt: Date | null },
  now = Date.now(),
): LiveStatus {
  if (!i.active) return 'inactive';
  if (!i.lastSeenAt) return 'never';
  return now - i.lastSeenAt.getTime() <= LIVE_STALE_MS ? 'online' : 'offline';
}

/** Several installations → one status: online if any is, else the most informative. */
export function combinedStatus(
  list: { active: boolean; lastSeenAt: Date | null }[],
): LiveStatus | 'empty' {
  if (!list.length) return 'empty';
  const all = list.map((i) => installationStatus(i));
  for (const s of ['online', 'offline', 'never'] as const)
    if (all.includes(s)) return s;
  return 'inactive';
}
