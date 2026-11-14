import { Injectable, Logger } from '@nestjs/common';
import { Site, TelegramLink, User } from '@prisma/client';
import { RedisService } from 'src/redis/redis.service';
import { TelegramApi, TelegramUpdate } from './telegram-api';
import { batteryText, DEFAULT_THRESHOLDS, statusText } from './telegram-alerts';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramSnapshotService } from './telegram-snapshot.service';
import { telegramConfig } from './telegram.config';

const MAX_LISTED_SITES = 20;

const HELP = [
  'Commands:',
  '/status – live status of your site',
  '/battery – battery readings',
  '/sites – your sites; /site 2 chooses one',
  '/link CODE – connect this chat to your Carbonoz account',
  '/unlink – disconnect this chat',
  '/help – this list',
  '',
  'Alerts and their thresholds are set on login.carbonoz.com → Settings → Telegram.',
].join('\n');

const NOT_LINKED =
  'This chat is not connected to a Carbonoz account.\n' +
  'Sign in at https://login.carbonoz.com → Settings → Telegram, create a code, then send /link CODE here.';

/**
 * Handles one Telegram update. Replies go straight to the chat; every reading
 * comes from the site snapshot, and every site is re-authorised against the
 * user's current Customer membership before it is shown.
 */
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger('Telegram');

  constructor(
    private readonly links: TelegramLinkService,
    private readonly snapshots: TelegramSnapshotService,
    private readonly redis: RedisService,
  ) {}

  api() {
    return new TelegramApi(telegramConfig());
  }

  /** Telegram re-sends an update it did not see acknowledged; handle each once. */
  async handleUpdate(update: TelegramUpdate, api = this.api()): Promise<void> {
    const msg = update.message;
    if (!msg?.text || !msg.from || msg.from.is_bot) return;
    const fresh = await this.redis.setIfAbsent(
      `telegram:update:${update.update_id}`,
      '1',
      86_400,
    );
    if (!fresh) return;

    const chatId = String(msg.chat.id);
    const reply = await this.reply(
      { chatId, chatType: msg.chat.type, telegramUserId: String(msg.from.id) },
      msg.text,
    );
    if (!reply) return;
    try {
      await api.sendMessage(chatId, reply);
    } catch (e) {
      this.logger.warn(`reply failed: ${e.message}`);
    }
  }

  /** The reply text for a command (null = ignore). Exposed for tests. */
  async reply(
    chat: { chatId: string; chatType: string; telegramUserId: string },
    text: string,
    now = Date.now(),
  ): Promise<string | null> {
    const [rawCommand, ...args] = text.trim().split(/\s+/);
    if (!rawCommand?.startsWith('/')) return 'Send /help to see what I can do.';
    const command = rawCommand.split('@')[0].toLowerCase();
    if (chat.chatType !== 'private')
      return 'For your privacy I only work in a private chat with you.';

    switch (command) {
      case '/start':
        if (args[0]) return this.link(chat, args[0]);
        return (
          'Hello! I send alerts and the status of your Carbonoz SolarBMS site.\n\n' +
          'To connect: sign in at https://login.carbonoz.com → Settings → Telegram, create a code, then send /link CODE here.\n\n' +
          HELP
        );
      case '/help':
        return HELP;
      case '/link':
        if (!args[0]) return 'Send the code from the website: /link CODE';
        return this.link(chat, args[0]);
      case '/unlink': {
        const linked = await this.links.forChat(chat.chatId);
        if (!linked) return NOT_LINKED;
        await this.links.revoke(linked.user.id, 'telegram');
        return 'Disconnected. This chat no longer receives alerts or data.';
      }
      case '/sites':
      case '/site':
      case '/status':
      case '/battery': {
        const linked = await this.links.forChat(chat.chatId);
        if (!linked) return NOT_LINKED;
        return this.siteCommand(command, args, linked, now);
      }
      default:
        return `Unknown command.\n\n${HELP}`;
    }
  }

  private async link(
    chat: { chatId: string; chatType: string; telegramUserId: string },
    code: string,
  ) {
    const r = await this.links.redeem(chat, code);
    if (r.ok)
      return (
        'Connected to your Carbonoz account. ✅\n' +
        'Send /status for your site. Alerts are set on the website under Settings → Telegram.'
      );
    if ('reason' in r && r.reason === 'locked')
      return 'Too many wrong codes. Please wait 15 minutes and create a new code.';
    if ('reason' in r && r.reason === 'not_private')
      return 'For your privacy I only work in a private chat with you.';
    return 'That code is not valid or has expired. Create a new one on the website (codes work once, for 10 minutes).';
  }

  private async siteCommand(
    command: string,
    args: string[],
    { link, user }: { link: TelegramLink; user: User },
    now: number,
  ): Promise<string> {
    const sites = await this.links.authorizedSites(user);
    if (!sites.length)
      return 'Your account has no site yet. Please contact Carbonoz.';

    if (command === '/sites') {
      const shown = sites.slice(0, MAX_LISTED_SITES);
      const lines = shown.map(
        (s, i) =>
          `${i + 1}. ${s.name}${
            s.id === link.defaultSiteId ? ' ← selected' : ''
          }`,
      );
      if (sites.length > shown.length)
        lines.push(`… and ${sites.length - shown.length} more`);
      return `Your sites:\n${lines.join(
        '\n',
      )}\n\nChoose one with /site NUMBER.`;
    }

    // A number picks from the user's OWN authorised list; ids are never accepted.
    const pick = (n: string | undefined): Site | null | 'bad' => {
      if (n == null) return null;
      const i = Number(n);
      return Number.isInteger(i) && i >= 1 && i <= sites.length
        ? sites[i - 1]
        : 'bad';
    };
    const picked = pick(args[0]);
    if (picked === 'bad')
      return `Use a number from /sites (1–${sites.length}).`;

    if (command === '/site') {
      if (!picked) return 'Send /site NUMBER, e.g. /site 1. See /sites.';
      await this.links.setDefaultSite(link, picked.id);
      return `Selected: ${picked.name}. /status and /battery now show this site.`;
    }

    const site =
      picked ??
      sites.find((s) => s.id === link.defaultSiteId) ??
      (sites.length === 1 ? sites[0] : null);
    if (!site)
      return 'You have several sites. Choose one with /sites and /site NUMBER.';

    const snapshot = await this.snapshots.of(site);
    const cfg = telegramConfig();
    const t = {
      ...DEFAULT_THRESHOLDS,
      staleMs: cfg.staleMs,
      offlineMs: cfg.offlineMs,
    };
    return command === '/battery'
      ? batteryText(snapshot, now, t)
      : statusText(snapshot, now, t);
  }
}
