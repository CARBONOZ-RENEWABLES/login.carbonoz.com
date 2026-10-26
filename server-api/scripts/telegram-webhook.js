/* eslint-disable */
/**
 * Register, inspect or remove the Telegram webhook, with the bot token and
 * webhook secret read from server-api/.env AS DATA (dotenv.parse): the file is
 * never run as a shell script, and neither value is printed or put on a
 * command line (no shell history, no `ps` listing).
 *
 *   node scripts/telegram-webhook.js info
 *   node scripts/telegram-webhook.js set [--url https://login.carbonoz.com/api/v1/telegram/webhook]
 *   node scripts/telegram-webhook.js delete
 *
 * Options: --env <path> (default: server-api/.env). Prints only Telegram's
 * answer: ok, description, and for `info` the registered URL, pending updates
 * and the last delivery error.
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const command = process.argv[2];
if (!['info', 'set', 'delete'].includes(command))
  fail('usage: node scripts/telegram-webhook.js info|set|delete [--url <webhook url>] [--env <path>]');

const envPath = arg('env') || path.join(__dirname, '..', '.env');
let env;
try {
  env = dotenv.parse(fs.readFileSync(envPath));
} catch (e) {
  fail(`cannot read ${envPath}: ${e.code || 'error'}`);
}
const token = (env.TELEGRAM_BOT_TOKEN || '').trim();
const secret = (env.TELEGRAM_WEBHOOK_SECRET || '').trim();
const apiUrl = (env.TELEGRAM_API_URL || 'https://api.telegram.org').replace(/\/$/, '');
if (!token) fail(`TELEGRAM_BOT_TOKEN is not set in ${envPath}`);
if (command === 'set' && !/^[A-Za-z0-9_-]{16,256}$/.test(secret))
  fail(`TELEGRAM_WEBHOOK_SECRET in ${envPath} is missing or invalid (16–256 of A-Z a-z 0-9 _ -)`);
if (typeof fetch !== 'function') fail('Node 18 or newer is needed (global fetch)');

const url = arg('url') || 'https://login.carbonoz.com/api/v1/telegram/webhook';
if (command === 'set' && !/^https:\/\//.test(url)) fail('--url must be https://');

const body = {
  info: {},
  set: { url, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: false },
  delete: { drop_pending_updates: false },
}[command];
const method = { info: 'getWebhookInfo', set: 'setWebhook', delete: 'deleteWebhook' }[command];

(async () => {
  let res;
  try {
    res = await fetch(`${apiUrl}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    // Never print the error object: its cause can contain the request URL (with the token).
    fail(`${method}: ${e && e.name === 'TimeoutError' ? 'timed out' : 'network error'}`);
  }
  let payload = {};
  try {
    payload = await res.json();
  } catch {
    /* non-JSON answer */
  }
  const out = { method, http: res.status, ok: payload.ok === true };
  if (payload.description) out.description = String(payload.description).slice(0, 200);
  if (command === 'info' && payload.result) {
    const r = payload.result;
    Object.assign(out, {
      url: r.url || null,
      pendingUpdates: r.pending_update_count ?? null,
      lastErrorDate: r.last_error_date ? new Date(r.last_error_date * 1000).toISOString() : null,
      lastErrorMessage: r.last_error_message || null,
    });
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
})();
