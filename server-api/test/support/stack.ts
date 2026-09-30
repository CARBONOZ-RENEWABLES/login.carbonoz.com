/**
 * Disposable test stack: MongoDB replica set, Redis and a mock Keycloak, each
 * a separate process so the outage tests can stop and restart them.
 * State (ports, dirs, pids) lives in a temp file shared by global setup and
 * the test files.
 */
import { ChildProcess, execSync, spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createServer, Socket } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

export const STATE_FILE = join(tmpdir(), 'carbonoz-e2e-state.json');

export interface StackState {
  dir: string;
  mongoPort: number;
  redisPort: number;
  kcPort: number;
  databaseUrl: string;
  redisUrl: string;
  kcUrl: string;
  pids: { mongo?: number; redis?: number; kc?: number };
}

export const readState = (): StackState =>
  JSON.parse(readFileSync(STATE_FILE, 'utf8'));
export const writeState = (s: StackState) =>
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

const portOpen = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = new Socket();
    s.setTimeout(500);
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
    s.once('timeout', () => {
      s.destroy();
      resolve(false);
    });
    s.connect(port, '127.0.0.1');
  });

export async function waitFor(
  fn: () => Promise<boolean> | boolean,
  timeoutMs = 60_000,
  stepMs = 250,
  what = 'condition',
) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const detached = (
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): ChildProcess => {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', env });
  child.unref();
  return child;
};

export async function startRedis(s: StackState) {
  const dir = join(s.dir, 'redis');
  mkdirSync(dir, { recursive: true });
  const child = detached('redis-server', [
    '--port',
    String(s.redisPort),
    '--dir',
    dir,
    '--appendonly',
    'yes',
    '--save',
    '',
    '--bind',
    '127.0.0.1',
  ]);
  s.pids.redis = child.pid;
  await waitFor(() => portOpen(s.redisPort), 20_000, 200, 'redis');
}

export function stopRedis(s: StackState) {
  // Graceful: AOF is flushed, like a normal Redis restart.
  spawnSync('redis-cli', ['-p', String(s.redisPort), 'shutdown'], {
    stdio: 'ignore',
  });
}

export async function startMongo(s: StackState) {
  const dbPath = join(s.dir, 'mongo');
  mkdirSync(dbPath, { recursive: true });
  const child = detached(process.execPath, [
    join(__dirname, 'mongo-launcher.js'),
    String(s.mongoPort),
    dbPath,
  ]);
  s.pids.mongo = child.pid;
  await waitFor(() => portOpen(s.mongoPort), 180_000, 500, 'mongodb');
  // The replica set needs a moment to elect itself primary.
  await waitFor(
    () => {
      const r = spawnSync(
        process.execPath,
        [
          '-e',
          `require('mongodb').MongoClient.connect('mongodb://127.0.0.1:${s.mongoPort}/?replicaSet=rs0&directConnection=true',{serverSelectionTimeoutMS:2000}).then(async c=>{const h=await c.db('admin').command({hello:1});await c.close();process.exit(h.isWritablePrimary?0:1)}).catch(()=>process.exit(1))`,
        ],
        { stdio: 'ignore' },
      );
      return r.status === 0;
    },
    120_000,
    500,
    'mongodb primary',
  );
}

/** Hard stop (like a crash): kills mongod and its launcher, and waits until the port is free. */
export async function killMongo(s: StackState) {
  try {
    execSync(`pkill -KILL -f "mongod.*--port ${s.mongoPort}"`);
  } catch {
    /* gone */
  }
  try {
    process.kill(s.pids.mongo, 'SIGKILL');
  } catch {
    /* gone */
  }
  await waitFor(
    async () => !(await portOpen(s.mongoPort)),
    20_000,
    200,
    'mongodb to stop',
  );
}

export async function startKeycloak(s: StackState) {
  const child = detached(process.execPath, [
    join(__dirname, 'mock-keycloak.js'),
    String(s.kcPort),
  ]);
  s.pids.kc = child.pid;
  await waitFor(() => portOpen(s.kcPort), 20_000, 200, 'mock keycloak');
}

export function pushSchema(s: StackState) {
  const r = spawnSync(
    'npx',
    ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'],
    {
      cwd: join(__dirname, '..', '..'),
      env: { ...process.env, DATABASE_URL: s.databaseUrl },
      encoding: 'utf8',
    },
  );
  if (r.status !== 0)
    throw new Error(`prisma db push failed: ${r.stderr || r.stdout}`);
}

export function requireBinary(name: string) {
  const r = spawnSync('which', [name]);
  if (r.status !== 0)
    throw new Error(
      `${name} is required on PATH for the e2e tests (e.g. apt-get install redis-server)`,
    );
}

export const ensureDir = (d: string) =>
  existsSync(d) ? d : (mkdirSync(d, { recursive: true }), d);
