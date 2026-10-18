/**
 * Simulation of ../deploy-update.sh: the real script runs in a throwaway git
 * repository (with a bare "origin"), with npm, npx, node and pm2 replaced by
 * shims that only record their calls. Nothing touches a database or pm2.
 *
 * Proves the order of side effects: a duplicate systemId stops the deployment
 * before the schema change (`prisma db push`), the builds and the restart; a
 * failed `git pull` or build keeps the original rollback point.
 */
import { spawnSync } from 'child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT =
  process.env.DEPLOY_SCRIPT ?? join(__dirname, '..', '..', 'deploy-update.sh');
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'sim',
  GIT_AUTHOR_EMAIL: 'sim@example.invalid',
  GIT_COMMITTER_NAME: 'sim',
  GIT_COMMITTER_EMAIL: 'sim@example.invalid',
};

// Each shim appends "<tool> <dir> <args>" to $CALLS.
const SHIMS: Record<string, string> = {
  npm: `echo "npm $(basename "$PWD") $*" >> "$CALLS"
if [ "$1 $2" = "run build" ]; then
  [ "\${SIM_BUILD_FAIL:-0}" = "1" ] && exit 1
  if [ "$(basename "$PWD")" = server-api ]; then mkdir -p dist/src/mails/templates && touch dist/src/main.js dist/src/mails/templates/conformation.template.hbs; else mkdir -p dist && touch dist/index.html; fi
fi
exit 0`,
  npx: `echo "npx $(basename "$PWD") $*" >> "$CALLS"`,
  node: `echo "node $(basename "$PWD") $*" >> "$CALLS"
if [ "$*" = "scripts/installation-system-id-index.js check" ] && [ "\${SIM_DUPLICATES:-0}" = "1" ]; then
  echo "duplicate systemIds found" >&2; exit 3
fi
exit 0`,
  pm2: `echo "pm2 $(basename "$PWD") $*" >> "$CALLS"`,
};

interface Sim {
  root: string;
  work: string;
  calls: string;
  bin: string;
  commitA: string;
  commitB: string;
}

const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

/** origin with commit A, a server checkout at A, then commit B pushed to origin. */
function makeSim(): Sim {
  const root = mkdtempSync(join(tmpdir(), 'deploy-sim-'));
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  const dev = join(root, 'dev');
  const bin = join(root, 'bin');
  mkdirSync(bin);
  for (const [name, body] of Object.entries(SHIMS)) {
    writeFileSync(join(bin, name), `#!/bin/bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, dev);
  copyFileSync(SCRIPT, join(dev, 'deploy-update.sh'));
  for (const d of ['server-api', 'offsettingdashboard'])
    mkdirSync(join(dev, d), { recursive: true });
  writeFileSync(join(dev, 'server-api', '.keep'), '');
  writeFileSync(join(dev, 'offsettingdashboard', '.keep'), '');
  writeFileSync(join(dev, '.gitignore'), 'logs/\ndist/\n');
  writeFileSync(join(dev, 'version'), 'A\n');
  git(dev, 'add', '.');
  git(dev, 'commit', '-q', '-m', 'A');
  git(dev, 'push', '-q', 'origin', 'HEAD:main');
  const commitA = git(dev, 'rev-parse', 'HEAD');
  git(root, 'clone', '-q', '-b', 'main', origin, work);
  writeFileSync(join(dev, 'version'), 'B\n');
  git(dev, 'commit', '-q', '-am', 'B');
  git(dev, 'push', '-q', 'origin', 'HEAD:main');
  const commitB = git(dev, 'rev-parse', 'HEAD');
  return { root, work, bin, calls: join(root, 'calls.log'), commitA, commitB };
}

function deploy(s: Sim, env: Record<string, string> = {}) {
  writeFileSync(s.calls, '');
  const r = spawnSync('bash', ['deploy-update.sh'], {
    cwd: s.work,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...GIT_ENV,
      PATH: `${s.bin}:${process.env.PATH}`,
      CALLS: s.calls,
      ...env,
    },
  });
  const calls = readFileSync(s.calls, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean);
  return { status: r.status, out: `${r.stdout}${r.stderr}`, calls };
}

const marker = (s: Sim) => {
  const f = join(s.work, 'logs', 'deploy-in-progress');
  return existsSync(f) ? readFileSync(f, 'utf8').trim() : null;
};
const previous = (s: Sim) =>
  readFileSync(join(s.work, 'logs', 'previous-commit'), 'utf8').trim();
const head = (s: Sim) => git(s.work, 'rev-parse', 'HEAD');

describe('deploy-update.sh (simulated: shims for npm, npx, node, pm2)', () => {
  const sims: Sim[] = [];
  const sim = () => {
    const s = makeSim();
    sims.push(s);
    return s;
  };
  afterAll(() => {
    for (const s of sims) rmSync(s.root, { recursive: true, force: true });
  });

  it('duplicate systemIds stop the deployment before db push, builds and pm2', () => {
    const s = sim();
    const r = deploy(s, { SIM_DUPLICATES: '1' });
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/duplicate systemIds found/);
    // Everything that ran, in order — and nothing after the check.
    expect(r.calls).toEqual([
      'npm server-api ci --legacy-peer-deps',
      'npm server-api run prisma:generate',
      'node server-api scripts/installation-system-id-index.js check',
    ]);
    expect(r.calls.join('\n')).not.toMatch(/db push|run build|pm2/);
    expect(existsSync(join(s.work, 'server-api', 'dist'))).toBe(false);
    // Rollback point = the commit that was running; the marker stays for the re-run.
    expect([previous(s), marker(s)]).toEqual([s.commitA, s.commitA]);
    expect(head(s)).toBe(s.commitB);
  });

  it('runs the check before db push, and db push before builds and restart', () => {
    const s = sim();
    const r = deploy(s);
    expect(r.status).toBe(0);
    const at = (re: RegExp) => r.calls.findIndex((c) => re.test(c));
    const order = [
      at(/^npm server-api ci/),
      at(/^npm server-api run prisma:generate/),
      at(/installation-system-id-index\.js check$/),
      at(/^npx server-api prisma db push --skip-generate$/),
      at(/^npm server-api run build$/),
      at(/^npm offsettingdashboard run build$/),
      at(/^pm2 .* restart ecosystem\.config\.js$/),
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(marker(s)).toBeNull(); // success clears it
    expect(previous(s)).toBe(s.commitA);
    expect(head(s)).toBe(s.commitB);
  });

  it('a failed git pull runs nothing and keeps the running commit as rollback point', () => {
    const s = sim();
    const url = git(s.work, 'remote', 'get-url', 'origin');
    git(s.work, 'remote', 'set-url', 'origin', join(s.root, 'unreachable.git'));
    const failed = deploy(s);
    expect(failed.status).not.toBe(0);
    expect(failed.calls).toEqual([]);
    expect(head(s)).toBe(s.commitA);
    expect([previous(s), marker(s)]).toEqual([s.commitA, s.commitA]);

    // Re-run after the cause is fixed: resumes with the same rollback point.
    git(s.work, 'remote', 'set-url', 'origin', url);
    const ok = deploy(s);
    expect(ok.status).toBe(0);
    expect(ok.out).toMatch(/Resuming an unfinished deployment/);
    expect(previous(s)).toBe(s.commitA);
    expect(marker(s)).toBeNull();
  });

  it('a pull refused as non-fast-forward changes nothing', () => {
    const s = sim();
    writeFileSync(join(s.work, 'version'), 'local\n');
    git(s.work, 'commit', '-q', '-am', 'local edit on the server');
    const local = head(s);
    const r = deploy(s);
    expect(r.status).not.toBe(0);
    expect(r.calls).toEqual([]);
    expect(head(s)).toBe(local);
    expect(marker(s)).toBe(local);
  });

  it('after a failed build, the re-run keeps the original rollback point (not the half-deployed commit)', () => {
    const s = sim();
    const failed = deploy(s, { SIM_BUILD_FAIL: '1' });
    expect(failed.status).toBe(1);
    expect(failed.calls.join('\n')).not.toMatch(/pm2/);
    expect(head(s)).toBe(s.commitB);
    const again = deploy(s, { SIM_BUILD_FAIL: '1' });
    expect(again.status).toBe(1);
    expect([previous(s), marker(s)]).toEqual([s.commitA, s.commitA]);
    const ok = deploy(s);
    expect(ok.status).toBe(0);
    expect(previous(s)).toBe(s.commitA);
    expect(marker(s)).toBeNull();
  });

  it('refuses a marker that does not name a commit, before doing anything', () => {
    const s = sim();
    mkdirSync(join(s.work, 'logs'), { recursive: true });
    writeFileSync(join(s.work, 'logs', 'deploy-in-progress'), 'garbage\n');
    const r = deploy(s);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/does not name a commit/);
    expect(r.calls).toEqual([]);
    expect(head(s)).toBe(s.commitA);
  });
});

describe('deploy-update.sh roles (backend and frontend on different hosts)', () => {
  const sims: Sim[] = [];
  const sim = () => {
    const s = makeSim();
    sims.push(s);
    return s;
  };
  afterAll(() => {
    for (const s of sims) rmSync(s.root, { recursive: true, force: true });
  });

  it('DEPLOY_ROLE=api: backend steps only, restarts only carbonoz-api', () => {
    const s = sim();
    const r = deploy(s, { DEPLOY_ROLE: 'api' });
    expect(r.status).toBe(0);
    const all = r.calls.join('\n');
    expect(all).toMatch(/installation-system-id-index\.js check/);
    expect(all).toMatch(/prisma db push/);
    expect(all).not.toMatch(/offsettingdashboard/);
    expect(r.calls.filter((c) => c.startsWith('pm2 '))[0]).toMatch(
      /startOrRestart ecosystem\.config\.js --only carbonoz-api$/,
    );
    expect(marker(s)).toBeNull();
  });

  it('DEPLOY_ROLE=frontend: no database step at all, restarts only carbonoz-frontend', () => {
    const s = sim();
    const r = deploy(s, { DEPLOY_ROLE: 'frontend' });
    expect(r.status).toBe(0);
    const all = r.calls.join('\n');
    expect(all).not.toMatch(/server-api|prisma|installation-system-id/);
    expect(all).toMatch(/npm offsettingdashboard run build/);
    expect(r.calls.filter((c) => c.startsWith('pm2 '))[0]).toMatch(
      /startOrRestart ecosystem\.config\.js --only carbonoz-frontend$/,
    );
  });

  it('refuses an unknown role before doing anything', () => {
    const s = sim();
    const r = deploy(s, { DEPLOY_ROLE: 'backend' });
    expect(r.status).toBe(2);
    expect(r.calls).toEqual([]);
    expect(head(s)).toBe(s.commitA);
  });
});
