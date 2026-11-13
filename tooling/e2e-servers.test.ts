/** @jest-environment node */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

it('starts isolated servers and reserves their ports for trials', () => {
  const root = mkdtempSync(join(tmpdir(), 'acceptance-projects-'));
  const repository = resolve(import.meta.dirname, '..');
  const ids = ['todo-01'];
  const env = { ...process.env };
  delete env.JEST_WORKER_ID;
  try {
    mkdirSync(join(root, 'tooling'));
    cpSync(join(repository, 'playwright.config.ts'), join(root, 'playwright.config.ts'));
    cpSync(join(repository, 'tooling/results.mjs'), join(root, 'tooling/results.mjs'));
    symlinkSync(join(repository, 'node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    ids
      .flatMap((id) => ['web', 'api'].map((pkg) => join(root, 'showcase', id, pkg)))
      .forEach((path) => {
        mkdirSync(path, { recursive: true });
        writeFileSync(join(path, 'package.json'), '{}');
      });
    const projects = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "import config from './playwright.config.ts'; console.log(JSON.stringify(config.webServer));",
        ],
        { cwd: root, env, encoding: 'utf8' },
      ),
    );
    expect(
      projects.map(
        ({ reuseExistingServer }: { reuseExistingServer: boolean }) => reuseExistingServer,
      ),
    ).toEqual([false, false, false, false]);
    expect(
      projects.map(
        ({ port, url }: { port?: number; url?: string }) => port ?? Number(new URL(url ?? '').port),
      ),
    ).toEqual([4001, 6173, 4011, 6183]);
    ['todo', 'notes'].forEach((task) => {
      const { ports } = JSON.parse(
        readFileSync(join(repository, `tooling/trial/tasks/${task}.json`), 'utf8'),
      );
      expect(ports).toEqual(
        expect.arrayContaining([5173, 3001, 5183, 3011, 6173, 4001, 6183, 4011]),
      );
    });
    const external = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "import config from './playwright.config.ts'; console.log(JSON.stringify(config.webServer));",
        ],
        { cwd: root, env: { ...env, E2E_BASE_URL: 'http://localhost:9000' }, encoding: 'utf8' },
      ),
    );
    expect(external[0].port).toBe(3001);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
