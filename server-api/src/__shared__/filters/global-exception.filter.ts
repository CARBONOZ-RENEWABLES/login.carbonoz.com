/*eslint-disable*/
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { LogsService } from 'src/logsM/logs.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logService: LogsService) {}
  async catch(exception: any, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = isHttp
      ? exception.getResponse()
      : exception.message;
    const error =
      typeof response === 'string'
        ? { message: exceptionResponse }
        : isHttp
        ? (exceptionResponse as Record<string, unknown>)
        : { message: exceptionResponse };

    await this.logService.logRequest(request, response, undefined, exception);
    Logger.error(
      `${request.url} ${request.method}`,
      exception.stack,
      GlobalExceptionFilter.name,
    );

    response.status(status).json({
      ...this.formatError(error),
      timestamp: new Date().toISOString(),
    });
  }

  formatError(error: string | Record<string, unknown> | any): any {
    if (error.message && !Array.isArray(error.message)) {
      error.message = [error.message];
    }
    return error;
  }
}
