/**
 * Telegram settings, read from the server environment only. Everything is off
 * unless TELEGRAM_ENABLED=true; alerts additionally need
 * TELEGRAM_NOTIFICATIONS_ENABLED=true, so the bot can be verified before any
 * alert is sent. The bot token is never logged or returned.
 */
export interface TelegramConfig {
  enabled: boolean;
  notificationsEnabled: boolean;
  token: string;
  botUsername: string;
  mode: 'webhook' | 'polling';
  webhookSecret: string;
  apiUrl: string;
  staleMs: number;
  offlineMs: number;
  maxMessagesPerHour: number;
  evaluateEveryMs: number;
}

const int = (v: string | undefined, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : d;
};

export function telegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  const token = (env.TELEGRAM_BOT_TOKEN ?? '').trim();
  const webhookSecret = (env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
  const mode = env.TELEGRAM_MODE === 'polling' ? 'polling' : 'webhook';
  // On only when switched on AND usable: a token, and a valid webhook secret in webhook mode.
  const usable =
    !!token &&
    (mode === 'polling' || /^[A-Za-z0-9_-]{16,256}$/.test(webhookSecret));
  const enabled = env.TELEGRAM_ENABLED === 'true' && usable;
  // At least 10 min: later than the dashboard's 5-min "delayed" rule, so a
  // platform-wide outage is recognised before any STALE alert could go out.
  const staleMs = int(env.TELEGRAM_STALE_MINUTES, 15, 10, 24 * 60) * 60_000;
  return {
    enabled,
    notificationsEnabled:
      enabled && env.TELEGRAM_NOTIFICATIONS_ENABLED === 'true',
    token,
    botUsername: (env.TELEGRAM_BOT_USERNAME ?? '').replace(/^@/, '').trim(),
    mode,
    webhookSecret,
    apiUrl: (env.TELEGRAM_API_URL || 'https://api.telegram.org').replace(
      /\/$/,
      '',
    ),
    staleMs,
    // Offline is never sooner than stale.
    offlineMs: Math.max(
      staleMs,
      int(env.TELEGRAM_OFFLINE_MINUTES, 60, 5, 7 * 24 * 60) * 60_000,
    ),
    maxMessagesPerHour: int(env.TELEGRAM_MAX_MESSAGES_PER_HOUR, 10, 1, 120),
    evaluateEveryMs: int(env.TELEGRAM_EVALUATE_SECONDS, 60, 10, 3600) * 1000,
  };
}
