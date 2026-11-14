import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ERole, Site, TelegramLink, User } from '@prisma/client';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import { TenancyService } from 'src/tenancy/tenancy.service';
import { telegramConfig } from './telegram.config';

/** No 0/O, 1/I/L: readable on a phone. 31^10 ≈ 8e14 codes. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;
const CODE_TTL_MS = 10 * 60_000;
/** Failed /link attempts per chat before it is locked out for the window. */
const MAX_FAILED = 5;
const FAIL_WINDOW_S = 15 * 60;

export const hashCode = (code: string) =>
  createHash('sha256').update(code.trim().toUpperCase()).digest('hex');

export const normalizeCode = (code: string) =>
  code.replace(/[\s-]/g, '').toUpperCase();

export type RedeemResult =
  | { ok: true; user: User; link: TelegramLink }
  | {
      ok: false;
      reason: 'locked' | 'invalid' | 'inactive_user' | 'not_private';
    };

export interface PreferencesInput {
  notify?: boolean;
  lowSocPct?: number;
  notifyLowSoc?: boolean;
  notifyOffline?: boolean;
  notifyStale?: boolean;
  notifyAlarms?: boolean;
  notifyRecovery?: boolean;
  siteIds?: string[];
}

/**
 * Account linking and preferences. A Telegram chat is linked to a Carbonoz
 * user only by a short-lived, single-use code that the signed-in user creates
 * on the website. Never by Telegram username, name or phone number.
 */
@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger('Telegram');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tenancy: TenancyService,
  ) {}

  active(userId: string) {
    return this.prisma.telegramLink.findFirst({
      where: { userId, revokedAt: null },
    });
  }

  /** New code for a signed-in user; earlier unused codes stop working. */
  async createCode(user: User, now = new Date()) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++)
      code += ALPHABET[randomInt(ALPHABET.length)];
    await this.prisma.telegramLinkCode.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
    await this.prisma.telegramLinkCode.create({
      // usedAt written as null: Prisma's `usedAt: null` filter does not match a missing field.
      data: {
        codeHash: hashCode(code),
        userId: user.id,
        expiresAt,
        usedAt: null,
      },
    });
    const bot = telegramConfig().botUsername;
    this.logger.log(`link code created user=${user.id}`);
    return {
      code,
      expiresAt: expiresAt.toISOString(),
      deepLink: bot ? `https://t.me/${bot}?start=${code}` : null,
    };
  }

  /**
   * Redeem a code from a Telegram chat. Single use (atomic), expiring,
   * brute-force limited per chat. Returns why it failed without saying more
   * than needed.
   */
  async redeem(
    chat: { chatId: string; chatType: string; telegramUserId: string },
    rawCode: string,
    now = new Date(),
  ): Promise<RedeemResult> {
    if (chat.chatType !== 'private')
      return { ok: false, reason: 'not_private' };
    const failKey = `telegram:link-fail:${chat.chatId}`;
    const fails = Number((await this.redis.raw.get(failKey)) ?? 0);
    if (fails >= MAX_FAILED) return { ok: false, reason: 'locked' };

    const fail = async () => {
      const n = await this.redis.raw.incr(failKey);
      if (n === 1) await this.redis.raw.expire(failKey, FAIL_WINDOW_S);
      return { ok: false as const, reason: 'invalid' as const };
    };
    const code = normalizeCode(rawCode);
    if (
      code.length !== CODE_LENGTH ||
      [...code].some((c) => !ALPHABET.includes(c))
    )
      return fail();

    const codeHash = hashCode(code);
    // Single use: only one redeemer can flip usedAt from null.
    const claimed = await this.prisma.telegramLinkCode.updateMany({
      where: { codeHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return fail();
    const row = await this.prisma.telegramLinkCode.findUnique({
      where: { codeHash },
    });
    const user =
      row && (await this.prisma.user.findUnique({ where: { id: row.userId } }));
    if (!user || user.activeStatus === false)
      return { ok: false, reason: 'inactive_user' };

    // One chat per user and one user per chat.
    await this.prisma.telegramLink.updateMany({
      where: {
        revokedAt: null,
        OR: [{ userId: user.id }, { chatId: chat.chatId }],
      },
      data: { revokedAt: now, revokedBy: 'relinked' },
    });
    const link = await this.prisma.telegramLink.create({
      data: {
        userId: user.id,
        chatId: chat.chatId,
        telegramUserId: chat.telegramUserId,
        linkedAt: now,
        revokedAt: null,
      },
    });
    await this.redis.raw.del(failKey);
    this.logger.log(`linked user=${user.id} link=${link.id}`);
    return { ok: true, user, link };
  }

  /** The active link of a chat and its user, if the user may still sign in. */
  async forChat(
    chatId: string,
  ): Promise<{ link: TelegramLink; user: User } | null> {
    const link = await this.prisma.telegramLink.findFirst({
      where: { chatId, revokedAt: null },
    });
    if (!link) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: link.userId },
    });
    if (!user || user.activeStatus === false) return null;
    return { link, user };
  }

  async revoke(userId: string, by: 'user' | 'admin' | 'telegram' | 'blocked') {
    const r = await this.prisma.telegramLink.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: by },
    });
    if (r.count) this.logger.log(`unlinked user=${userId} by=${by}`);
    return r.count > 0;
  }

  /**
   * Revoke one specific link, and only while it still belongs to that chat
   * (conditional update: a newer link of the same user is never touched).
   */
  async revokeLink(linkId: string, chatId: string, by: 'blocked' | 'admin') {
    const r = await this.prisma.telegramLink.updateMany({
      where: { id: linkId, chatId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: by },
    });
    if (r.count) this.logger.log(`unlinked link=${linkId} by=${by}`);
    return r.count > 0;
  }

  /**
   * Sites this user may see, from Customer membership (all sites for ADMIN).
   * Re-read on every use: removing someone from a customer takes effect at once.
   */
  authorizedSites(user: User): Promise<Site[]> {
    return this.tenancy.sitesFor(user) as unknown as Promise<Site[]>;
  }

  /**
   * Sites alerts are sent for: the chosen ones that are still authorised.
   * Customers with no choice get all their sites; ADMINs must choose (they
   * can see every site, which would be a flood).
   */
  async alertSites(user: User, link: TelegramLink): Promise<Site[]> {
    const sites = await this.authorizedSites(user);
    if (link.siteIds.length)
      return sites.filter((s) => link.siteIds.includes(s.id));
    return user.role === ERole.ADMIN ? [] : sites;
  }

  async updatePreferences(user: User, input: PreferencesInput) {
    const link = await this.active(user.id);
    if (!link) throw new NotFoundException('Telegram is not linked');
    if (input.siteIds) {
      // Every id is checked against the user's own access, never trusted.
      for (const id of input.siteIds)
        await this.tenancy.assertSiteAccess(user, id);
    }
    if (
      input.lowSocPct != null &&
      !(
        Number.isInteger(input.lowSocPct) &&
        input.lowSocPct >= 5 &&
        input.lowSocPct <= 95
      )
    )
      throw new BadRequestException(
        'lowSocPct must be a whole number from 5 to 95',
      );
    const data = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    );
    return this.prisma.telegramLink.update({ where: { id: link.id }, data });
  }

  async setDefaultSite(link: TelegramLink, siteId: string | null) {
    return this.prisma.telegramLink.update({
      where: { id: link.id },
      data: { defaultSiteId: siteId },
    });
  }
}
