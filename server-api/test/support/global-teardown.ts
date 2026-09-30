import { rmSync } from 'fs';
import { killMongo, readState, stopRedis } from './stack';

export default async function globalTeardown() {
  let s;
  try {
    s = readState();
  } catch {
    return;
  }
  stopRedis(s);
  await killMongo(s);
  try {
    process.kill(s.pids.kc, 'SIGKILL');
  } catch {
    /* gone */
  }
  try {
    rmSync(s.dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
