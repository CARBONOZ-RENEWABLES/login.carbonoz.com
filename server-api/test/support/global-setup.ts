import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  freePort,
  pushSchema,
  requireBinary,
  startKeycloak,
  startMongo,
  startRedis,
  StackState,
  writeState,
} from './stack';

export default async function globalSetup() {
  requireBinary('redis-server');
  requireBinary('redis-cli');
  const dir = mkdtempSync(join(tmpdir(), 'carbonoz-e2e-'));
  const [mongoPort, redisPort, kcPort] = [
    await freePort(),
    await freePort(),
    await freePort(),
  ];
  const s: StackState = {
    dir,
    mongoPort,
    redisPort,
    kcPort,
    databaseUrl: `mongodb://127.0.0.1:${mongoPort}/carbonoz_e2e?replicaSet=rs0&directConnection=true`,
    redisUrl: `redis://127.0.0.1:${redisPort}`,
    kcUrl: `http://localhost:${kcPort}`,
    pids: {},
  };
  await Promise.all([startRedis(s), startKeycloak(s), startMongo(s)]);
  pushSchema(s);
  writeState(s);
}
