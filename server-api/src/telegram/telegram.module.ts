import { Module } from '@nestjs/common';
import { SolarModule } from 'src/solar/solar.module';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramNotifierService } from './telegram-notifier.service';
import { TelegramPollingService } from './telegram-polling.service';
import { TelegramSnapshotService } from './telegram-snapshot.service';
import {
  AdminTelegramController,
  TelegramController,
  TelegramWebhookController,
} from './telegram.controller';

/** Telegram bot and alerts. Inert unless TELEGRAM_ENABLED=true (see telegram.config.ts). */
@Module({
  imports: [SolarModule],
  controllers: [
    TelegramController,
    AdminTelegramController,
    TelegramWebhookController,
  ],
  providers: [
    TelegramLinkService,
    TelegramSnapshotService,
    TelegramBotService,
    TelegramNotifierService,
    TelegramPollingService,
  ],
})
export class TelegramModule {}
