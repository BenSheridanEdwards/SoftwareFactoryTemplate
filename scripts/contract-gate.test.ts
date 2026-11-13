import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pactDirectory = mkdtempSync(join(tmpdir(), 'art-contract-gate-'));
const env = {
  ...process.env,
  PACT_DIR: pactDirectory,
  SCARF_ANALYTICS: 'false',
  PACT_DO_NOT_TRACK: 'true',
};

function run(args: string[]) {
  return spawnSync(
    'node_modules/.bin/jest',
    ['--selectProjects', 'contract', '--testPathPattern', ...args, '--runInBand'],
    {
      env,
      encoding: 'utf8',
      timeout: 120_000,
    },
  );
}

it('accepts the shipped consumer and provider, then rejects a broken greeting contract', () => {
  const real = spawnSync('pnpm', ['test:contract'], { env, encoding: 'utf8', timeout: 120_000 });
  if (real.status !== 0) throw new Error(real.stdout + real.stderr);
  expect(real.stdout + real.stderr).toContain('Tests:');
  expect(real.status).toBe(0);
  expect(real.stdout + real.stderr).not.toContain('util._extend');
  const path = join(pactDirectory, 'web-api.json');
  const pact = readFileSync(path, 'utf8');
  expect(pact).toContain('Hello, Ada!');
  writeFileSync(path, pact.replaceAll('Hello, Ada!', 'Hello there, Ada!'));
  const broken = run(['apps/api']);
  expect(broken.status).toBe(1);
  expect(broken.stdout + broken.stderr).toContain('greeting.greet');
  expect(broken.stdout + broken.stderr).not.toContain('DEP0060');
}, 180_000);

it('replaces stale interactions when recording the shipped contract', () => {
  const initial = spawnSync('pnpm', ['test:contract'], { env, encoding: 'utf8', timeout: 120_000 });
  if (initial.status !== 0) throw new Error(initial.stdout + initial.stderr);
  const path = join(pactDirectory, 'web-api.json');
  const pact = JSON.parse(readFileSync(path, 'utf8'));
  const stale = structuredClone(pact.interactions[0]);
  stale.description = 'removed procedure';
  stale.request.path = '/trpc/removed.procedure';
  pact.interactions.push(stale);
  writeFileSync(path, JSON.stringify(pact));
  const fresh = spawnSync('pnpm', ['test:contract'], { env, encoding: 'utf8', timeout: 120_000 });
  expect(fresh.stdout + fresh.stderr).not.toContain('FAIL');
  expect(fresh.status).toBe(0);
  expect(readFileSync(path, 'utf8')).not.toContain('removed.procedure');
}, 240_000);
