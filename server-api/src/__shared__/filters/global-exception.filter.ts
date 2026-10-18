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
import { redactText, redactUrl } from 'src/__shared__/utils/redact';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logService: LogsService) {}
  async catch(exception: any, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const isHttp = exception instanceof HttpException;
    // body-parser errors (payload too large, malformed JSON) carry their own 4xx status.
    const clientError =
      !isHttp &&
      exception?.expose &&
      exception?.status >= 400 &&
      exception?.status < 500;
    const status = isHttp
      ? exception.getStatus()
      : clientError
      ? exception.status
      : HttpStatus.INTERNAL_SERVER_ERROR;
    // Unexpected errors (database, driver, bugs) never reach the client in
    // detail: their messages can name hosts, collections or query values.
    // The full, redacted error goes to the server log and the logs collection.
    const exceptionResponse = isHttp
      ? exception.getResponse()
      : clientError
      ? exception.message
      : 'Internal server error';
    const error =
      typeof response === 'string'
        ? { message: exceptionResponse }
        : isHttp
        ? (exceptionResponse as Record<string, unknown>)
        : { message: exceptionResponse };

    await this.logService.logRequest(request, response, undefined, exception);
    Logger.error(
      `${redactUrl(request.url ?? '')} ${request.method}`,
      redactText(exception?.stack ?? String(exception), 4000),
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
