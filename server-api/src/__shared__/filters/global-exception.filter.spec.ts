import { ArgumentsHost, ForbiddenException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

function run(exception: unknown) {
  const sent: { status?: number; body?: any } = {};
  const response = {
    statusCode: 500,
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
    },
  };
  const request = { url: '/api/v1/x?token=abc', method: 'POST' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  const logged: unknown[] = [];
  const filter = new GlobalExceptionFilter({
    logRequest: async (...a: unknown[]) => void logged.push(a),
  } as never);
  return filter.catch(exception, host).then(() => ({ sent, logged }));
}

describe('GlobalExceptionFilter', () => {
  it('never returns the internal message of an unexpected error', async () => {
    const { sent, logged } = await run(
      new Error('connect mongodb://app:hunter2@10.0.0.5:27017 ECONNREFUSED'),
    );
    expect(sent.status).toBe(500);
    expect(JSON.stringify(sent.body)).not.toMatch(
      /mongodb|hunter2|10\.0\.0\.5/,
    );
    expect(sent.body.message).toEqual(['Internal server error']);
    expect(logged).toHaveLength(1); // kept (redacted) server-side
  });

  it('keeps HTTP exceptions as they are', async () => {
    const { sent } = await run(new ForbiddenException('Wrong User password'));
    expect(sent.status).toBe(403);
    expect(sent.body.message).toEqual(['Wrong User password']);
  });

  it('keeps body-parser client errors (status + message)', async () => {
    const e = Object.assign(new Error('request entity too large'), {
      expose: true,
      status: 413,
    });
    const { sent } = await run(e);
    expect(sent.status).toBe(413);
    expect(sent.body.message).toEqual(['request entity too large']);
  });
});
