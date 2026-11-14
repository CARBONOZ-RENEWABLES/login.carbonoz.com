import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ERole, User } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { timingSafeEqual } from 'crypto';
import { GenericResponse } from 'src/__shared__/dto';
import { AllowRoles, GetUser } from 'src/auth/decorators';
import { JwtGuard } from 'src/auth/guard/jwt.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { isObjectId } from 'src/tenancy/tenancy.service';
import { TelegramUpdate } from './telegram-api';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramNotifierService } from './telegram-notifier.service';
import { telegramConfig } from './telegram.config';

export class TelegramPreferencesDto {
  @IsOptional() @IsBoolean() notify?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(95)
  lowSocPct?: number;
  @IsOptional() @IsBoolean() notifyLowSoc?: boolean;
  @IsOptional() @IsBoolean() notifyOffline?: boolean;
  @IsOptional() @IsBoolean() notifyStale?: boolean;
  @IsOptional() @IsBoolean() notifyAlarms?: boolean;
  @IsOptional() @IsBoolean() notifyRecovery?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsMongoId({ each: true })
  siteIds?: string[];
}

const requireEnabled = () => {
  if (!telegramConfig().enabled)
    throw new NotFoundException('Telegram is not enabled');
};

/** The signed-in user's own Telegram link. */
@Controller('telegram')
@ApiTags('telegram')
@UseGuards(JwtGuard, RolesGuard)
@AllowRoles(ERole.USER, ERole.ADMIN)
@ApiBearerAuth()
export class TelegramController {
  constructor(private readonly links: TelegramLinkService) {}

  @ApiOperation({
    summary:
      'Telegram status: enabled, linked, preferences, the sites the user may choose',
  })
  @Get()
  async status(@GetUser() user: User) {
    const cfg = telegramConfig();
    if (!cfg.enabled)
      return new GenericResponse('telegram', { enabled: false });
    const [link, sites] = await Promise.all([
      this.links.active(user.id),
      this.links.authorizedSites(user),
    ]);
    return new GenericResponse('telegram', {
      enabled: true,
      notificationsEnabled: cfg.notificationsEnabled,
      botUsername: cfg.botUsername || null,
      linked: !!link,
      // Never the chat id.
      link: link && {
        linkedAt: link.linkedAt,
        notify: link.notify,
        lowSocPct: link.lowSocPct,
        notifyLowSoc: link.notifyLowSoc,
        notifyOffline: link.notifyOffline,
        notifyStale: link.notifyStale,
        notifyAlarms: link.notifyAlarms,
        notifyRecovery: link.notifyRecovery,
        siteIds: link.siteIds.filter((id) => sites.some((s) => s.id === id)),
      },
      mustChooseSites: user.role === ERole.ADMIN,
      sites: sites.map((s) => ({ id: s.id, name: s.name })),
    });
  }

  @ApiOperation({
    summary: 'Create a single-use code (10 minutes) to link a Telegram chat',
  })
  @Post('link-code')
  async linkCode(@GetUser() user: User) {
    requireEnabled();
    return new GenericResponse(
      'telegram-link-code',
      await this.links.createCode(user),
    );
  }

  @Patch('preferences')
  async preferences(
    @GetUser() user: User,
    @Body() dto: TelegramPreferencesDto,
  ) {
    requireEnabled();
    await this.links.updatePreferences(user, dto);
    return new GenericResponse('telegram-preferences', { saved: true });
  }

  @HttpCode(200)
  @Delete('link')
  async unlink(@GetUser() user: User) {
    requireEnabled();
    return new GenericResponse('telegram-unlinked', {
      revoked: await this.links.revoke(user.id, 'user'),
    });
  }
}

/** Admin view and revocation. No chat ids or message texts are returned. */
@Controller('admin/telegram')
@ApiTags('admin')
@UseGuards(JwtGuard, RolesGuard)
@AllowRoles(ERole.ADMIN)
@ApiBearerAuth()
export class AdminTelegramController {
  constructor(
    private readonly links: TelegramLinkService,
    private readonly notifier: TelegramNotifierService,
  ) {}

  @Get('stats')
  async stats() {
    return new GenericResponse('telegram-stats', {
      enabled: telegramConfig().enabled,
      ...(await this.notifier.stats()),
    });
  }

  @HttpCode(200)
  @Delete('links/:userId')
  async revoke(@Param('userId') userId: string) {
    if (!isObjectId(userId)) throw new NotFoundException('User not found');
    return new GenericResponse('telegram-unlinked', {
      revoked: await this.links.revoke(userId, 'admin'),
    });
  }
}

/**
 * Telegram webhook. No user auth: Telegram proves itself with the secret token
 * set via setWebhook (header X-Telegram-Bot-Api-Secret-Token), compared in
 * constant time. 404 when disabled or in polling mode.
 */
@Controller('telegram/webhook')
export class TelegramWebhookController {
  constructor(private readonly bot: TelegramBotService) {}

  @ApiExcludeEndpoint()
  @HttpCode(200)
  @Post()
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') token: string | undefined,
    @Body() update: TelegramUpdate,
  ) {
    const cfg = telegramConfig();
    if (!cfg.enabled || cfg.mode !== 'webhook') throw new NotFoundException();
    const a = Buffer.from(token ?? '');
    const b = Buffer.from(cfg.webhookSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new NotFoundException();
    if (update && typeof update.update_id === 'number')
      await this.bot.handleUpdate(update);
    return { ok: true };
  }
}
