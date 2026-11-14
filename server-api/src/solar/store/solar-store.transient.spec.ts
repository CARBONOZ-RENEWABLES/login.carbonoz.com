import { Prisma } from '@prisma/client';
import { isTransient } from './solar-store.service';

describe('isTransient', () => {
  it.each([
    // Production 5–7 Nov 2026: main Redis full under noeviction.
    "OOM command not allowed when used memory > 'maxmemory'.",
    'LOADING Redis is loading the dataset in memory',
    'BUSY Redis is busy running a script.',
    'MASTERDOWN Link with MASTER is down',
    "READONLY You can't write against a read only replica.",
    'MISCONF Redis is configured to save RDB snapshots, but it is currently not able to persist on disk.',
    'The client is closed',
    'Socket closed unexpectedly',
  ])('main-Redis refusal is transient: %s', (message) => {
    expect(isTransient(new Error(message))).toBe(true);
  });

  it('keeps the MongoDB outage cases', () => {
    expect(
      isTransient(
        new Prisma.PrismaClientKnownRequestError(
          "Can't reach database server",
          {
            code: 'P1001',
            clientVersion: 'test',
          },
        ),
      ),
    ).toBe(true);
    expect(isTransient(new Error('Server selection timed out'))).toBe(true);
    expect(isTransient(new Error('connection closed'))).toBe(true);
  });

  it.each([
    'Invalid value for metrics',
    'Unique constraint failed on the fields',
    // A message merely mentioning a keyword mid-text is not a Redis reply.
    'metric name BOOM contains OOM',
  ])('a permanent error stays permanent: %s', (message) => {
    expect(isTransient(new Error(message))).toBe(false);
  });
});
