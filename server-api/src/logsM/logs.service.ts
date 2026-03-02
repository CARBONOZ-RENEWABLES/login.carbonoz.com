import { ELogType, User } from '.prisma/client';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class LogsService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly prismaService: PrismaService) {}

  private getIP(req: Request): string {
    return (req.headers['x-forwarded-for'] ||
      req.ip ||
      req.socket.remoteAddress ||
      'Unknown') as string;
  }

  /**
   * Logs errors, system events, and security alerts
   */

  async logRequest(req: Request, res: Response, user?: User, error?: Error) {
    const start = Date.now();
    const duration = Date.now() - start;

    await this.prismaService.logs.create({
      data: {
        userId: user?.id || null,
        eventType: ELogType.ERROR,
        description: `Error occurred: ${error.message}`,
        ipAddress: this.getIP(req),
        requestUrl: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode.toString(),
        responseTime: `${duration}ms`,
        metadata: JSON.stringify({
          query: req.query,
          body: req.method !== 'GET' ? req.body : undefined,
          error: error ? error.stack : undefined,
        }),
      },
    });
  }

  /**
   * Logs system events like server start/shutdown and performance monitoring
   */
  async logSystemEvent(description: string) {
    await this.prismaService.logs.create({
      data: {
        eventType: ELogType.SYSTEM_EVENT,
        description,
      },
    });
  }

  /**
   * Logs security-related events
   */
  async logSecurityAlert(description: string, userId?: string) {
    await this.prismaService.logs.create({
      data: {
        userId: userId || null,
        eventType: ELogType.SECURITY_ALERT,
        description,
      },
    });
  }

  /**
   * Logs when the application starts
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async onModuleInit() {}
  /**
   * Logs when the application shuts down
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async onModuleDestroy() {}

  /**
   * Logs slow API requests (e.g., > 500ms)
   */
  async logSlowRequest(req: Request, duration: number, user?: User) {
    if (duration > 500) {
      await this.prismaService.logs.create({
        data: {
          userId: user?.id || null,
          eventType: ELogType.SYSTEM_EVENT,
          description: `Slow request: ${req.method} ${req.originalUrl} took ${duration}ms`,
        },
      });
    }
  }
}
