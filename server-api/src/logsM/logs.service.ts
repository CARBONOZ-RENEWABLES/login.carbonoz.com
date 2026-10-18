import { ELogType, User } from '.prisma/client';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';
import { redactText, redactUrl, safeJson } from 'src/__shared__/utils/redact';

@Injectable()
export class LogsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogsService.name);
  constructor(private readonly prismaService: PrismaService) {}

  private getIP(req: Request): string {
    return (req.headers['x-forwarded-for'] ||
      req.ip ||
      req.socket.remoteAddress ||
      'Unknown') as string;
  }

  /**
   * Logs a failed request. Everything stored is redacted (utils/redact):
   * credential fields at any depth in body and query, credential-shaped text
   * in messages and stack traces, and sizes are bounded. Never throws: a
   * logging failure must not replace the original error response.
   */
  async logRequest(req: Request, res: Response, user?: User, error?: Error) {
    const start = Date.now();
    const duration = Date.now() - start;

    await this.prismaService.logs
      .create({
        data: {
          userId: user?.id || null,
          eventType: ELogType.ERROR,
          description: `Error occurred: ${redactText(
            error?.message ?? 'unknown',
            500,
          )}`,
          ipAddress: this.getIP(req),
          requestUrl: redactUrl(req.originalUrl ?? ''),
          method: req.method,
          statusCode: res.statusCode.toString(),
          responseTime: `${duration}ms`,
          metadata: safeJson(
            {
              query: req.query,
              body: req.method !== 'GET' ? req.body : undefined,
              error: error?.stack ? redactText(error.stack, 4000) : undefined,
            },
            8000,
            { maxString: 4000 },
          ),
        },
      })
      .catch((e) =>
        this.logger.error(
          `Could not store error log: ${redactText(e?.message ?? e, 300)}`,
        ),
      );
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
          description: `Slow request: ${req.method} ${redactUrl(
            req.originalUrl ?? '',
          )} took ${duration}ms`,
        },
      });
    }
  }
}
