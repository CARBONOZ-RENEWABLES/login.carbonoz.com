import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';

export type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClient;
  private readonly extra: RedisClient[] = [];

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    // Without an 'error' listener a dropped connection crashes the process;
    // with one, node-redis reconnects and `ready` reports the state meanwhile.
    this.client.on('error', (e) => this.logError(e));
    this.client.connect().catch(console.error);
  }

  private lastErrorLog = 0;
  private logError(e: Error) {
    // Reconnect attempts fire repeatedly; log at most every 10 s.
    if (Date.now() - this.lastErrorLog < 10_000) return;
    this.lastErrorLog = Date.now();
    this.logger.error(`Redis connection error: ${e.message}`);
  }

  async get(key: string): Promise<string | null> {
    const v = await this.client.get(key);
    return v == null ? null : v.toString();
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setEx(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  /** SET key value EX ttl NX — true when the key was created. */
  async setIfAbsent(key: string, value: string, ttl: number): Promise<boolean> {
    const res = await this.client.set(key, value, { EX: ttl, NX: true });
    return res === 'OK';
  }

  /** SET key value PX ms NX — true when the key was created. */
  async setIfAbsentMs(
    key: string,
    value: string,
    ms: number,
  ): Promise<boolean> {
    const res = await this.client.set(key, value, { PX: ms, NX: true });
    return res === 'OK';
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async expire(key: string, ttl: number): Promise<void> {
    await this.client.expire(key, ttl);
  }

  async getDel(key: string): Promise<string | null> {
    const v = await this.client.getDel(key);
    return v == null ? null : v.toString();
  }

  /** False while disconnected/reconnecting; commands would otherwise queue and hang. */
  get ready(): boolean {
    return this.client.isReady;
  }

  /** Shared connection for commands without a wrapper here (hashes, streams…). */
  get raw(): RedisClient {
    return this.client;
  }

  /** A dedicated connection, for blocking reads that must not stall `raw`. */
  async dedicated(): Promise<RedisClient> {
    const c = this.client.duplicate();
    c.on('error', (e) => this.logError(e));
    await c.connect();
    this.extra.push(c);
    return c;
  }

  async onModuleDestroy() {
    await Promise.all(this.extra.map((c) => c.quit().catch(() => undefined)));
    await this.client.quit();
  }
}
