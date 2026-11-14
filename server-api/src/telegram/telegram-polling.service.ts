import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RedisService } from 'src/redis/redis.service';
import { TelegramApi } from './telegram-api';
import { TelegramBotService } from './telegram-bot.service';
import { telegramConfig } from './telegram.config';

const OFFSET_KEY = 'telegram:poll-offset';

/**
 * TELEGRAM_MODE=polling: long-poll getUpdates instead of a webhook. Needs only
 * outbound HTTPS. A single process should run it (getUpdates conflicts with a
 * second poller or with a webhook; Telegram answers 409 and we back off).
 */
@Injectable()
export class TelegramPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Telegram');
  private stopped = false;

  constructor(
    private readonly bot: TelegramBotService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    const cfg = telegramConfig();
    if (!cfg.enabled || cfg.mode !== 'polling') return;
    void this.loop(new TelegramApi(cfg));
  }

  onModuleDestroy() {
    this.stopped = true;
  }

  private async loop(api: TelegramApi) {
    while (!this.stopped) {
      try {
        const offset = Number((await this.redis.raw.get(OFFSET_KEY)) ?? 0);
        const updates = await api.getUpdates(offset, 25);
        for (const u of updates) {
          await this.bot.handleUpdate(u, api);
          await this.redis.raw.set(OFFSET_KEY, String(u.update_id + 1));
        }
      } catch (e) {
        this.logger.warn(`polling: ${e.message}`);
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
  }
}
