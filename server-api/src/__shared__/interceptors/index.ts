import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { Observable, catchError, tap } from 'rxjs';
import { LogsService } from 'src/logsM/logs.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private logsService: LogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const user: User | undefined = req.user;

    const start = Date.now();

    return next.handle().pipe(
      tap(async () => {
        const duration = Date.now() - start;
        // Log slow requests
        if (duration > 500) {
          await this.logsService.logSlowRequest(req, duration, user);
        }
      }),
      catchError(async (error) => {
        await this.logsService.logRequest(req, res, user, error);
        throw error;
      }),
    );
  }
}
