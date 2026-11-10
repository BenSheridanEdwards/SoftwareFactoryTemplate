import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const root = fileURLToPath(new URL('../../', import.meta.url));
/** Each failing case and the exact guard result its fixture attaches. */
const unexpected = (message) => ({ unexpected: [message], missing: [] });
const failures = [
  { title: 'console.warning', guard: unexpected('console.warning: x') },
  { title: 'console.error', guard: unexpected('console.error: x') },
  { title: 'pageerror', guard: unexpected('pageerror: x') },
  { title: 'worker console.warning', guard: unexpected('console.warning: x') },
  { title: 'worker pageerror', guard: unexpected('pageerror: x') },
  { title: 'popup console.warning', guard: unexpected('console.warning: x') },
  { title: 'popup pageerror', guard: unexpected('pageerror: x') },
  { title: 'runner console warn', guard: unexpected('runner console.warn: x') },
  { title: 'runner console error', guard: unexpected('runner console.error: x') },
  { title: 'runner warning', guard: unexpected('runner warning: x') },
  { title: 'missing expected message', guard: { unexpected: [], missing: ['/expected error/'] } },
];
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const specs = (suite) => [...suite.specs, ...(suite.suites ?? []).flatMap(specs)];

/** The guard result the fixture attached to a failed attempt. */
function attachedGuard(attempt) {
  const attachment = attempt.attachments.find(({ name }) => name === 'console-guard.json');
  assert.ok(attachment, 'The fixture must attach its guard result');
  return JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
}

function rejectViolation(spec, guard) {
  assert.ok(spec, `Missing guard case: ${JSON.stringify(guard)}`);
  assert.equal(spec.tests.length, 1);
  const [result] = spec.tests;
  assert.equal(result.expectedStatus, 'passed');
  assert.equal(result.status, 'unexpected', `${spec.title} must fail`);
  assert.ok(result.results.length > 0);
  result.results.forEach((attempt) => {
    assert.equal(attempt.status, 'failed');
    assert.equal(attempt.errors.length, 1);
    const [error] = attempt.errors;
    assert.equal(error.location.file, join(root, 'apps/web/e2e/fixtures.ts'));
    const message = stripVTControlCharacters(error.message);
    assert.deepEqual(attachedGuard(attempt), guard, message);
    assert.match(message, /toEqual/);
  });
}

function runChild(config, directory, args = []) {
  const child = spawnSync(
    process.execPath,
    [
      fileURLToPath(import.meta.resolve('@playwright/test/cli')),
      'test',
      '--config',
      config,
      '--reporter=json',
      '--output',
      directory,
      ...args,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      // NO_COLOR beside FORCE_COLOR makes Node warn at worker start, which would hide how
      // the fixture treats a test's first Node warning, so the child runs as CI does.
      env: { ...process.env, E2E_BASE_URL: '', FORCE_COLOR: '0', NO_COLOR: undefined },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  assert.ifError(child.error);
  assert.equal(child.signal, null, child.stderr);
  const report = JSON.parse(child.stdout);
  assert.deepEqual(report.errors, [], child.stderr);
  return { child, report, cases: report.suites.flatMap(specs) };
}

/** Each mutant removes one recording path from a copy of the fixture; its case must then pass. */
const mutations = [
  {
    title: 'console.error',
    find: "message.type() === 'warning' || message.type() === 'error'",
    replace: "message.type() === 'warning'",
  },
  {
    title: 'worker console.warning',
    find: "if (message.type() === 'warning' || message.type() === 'error') {",
    replace:
      "if (!message.worker() && (message.type() === 'warning' || message.type() === 'error')) {",
  },
  {
    title: 'runner warning',
    find: "process.on('warning', recordWarning);",
    replace: '',
  },
  {
    title: 'runner console warn',
    find: "const RUNNER_METHODS: RunnerMethod[] = ['warn', 'error'];",
    replace: "const RUNNER_METHODS: RunnerMethod[] = ['error'];",
  },
  {
    title: 'popup console.warning',
    find: "context.on('console', recordConsole);",
    replace:
      "context.on('page', (opened) => { void opened.opener().then((opener) => { if (!opener) opened.on('console', recordConsole); }); });",
  },
];

test('the real browser fixture rejects every guard violation and allows declared errors', () => {
  mkdirSync(join(root, '.scratch'), { recursive: true });
  const directory = mkdtempSync(join(root, '.scratch/console-guard-'));
  try {
    const { child, report, cases } = runChild(
      'tooling/console-guard/playwright.config.ts',
      join(directory, 'results'),
    );
    assert.equal(cases.length, failures.length + 1, child.stderr);
    failures.forEach(({ title, guard }) => {
      rejectViolation(
        cases.find((entry) => entry.title === title),
        guard,
      );
    });
    const declared = cases.find(({ title }) => title === 'declared expected error');
    assert.ok(declared);
    assert.equal(declared.tests.length, 1);
    const [passing] = declared.tests;
    assert.equal(passing.expectedStatus, 'passed');
    assert.equal(passing.status, 'expected');
    assert.equal(passing.results.length, 1);
    assert.equal(passing.results[0].status, 'passed');
    assert.deepEqual(passing.results[0].errors, []);
    assert.equal(report.stats.expected, 1);
    assert.equal(report.stats.unexpected, failures.length);
    assert.equal(report.stats.skipped, 0);
    assert.equal(report.stats.flaky, 0);
    assert.equal(child.status, 1);

    const fixture = readFileSync(join(root, 'apps/web/e2e/fixtures.ts'), 'utf8');
    const mutantCases = readFileSync(
      join(root, 'tooling/console-guard/guard.cases.ts'),
      'utf8',
    ).replace('../../apps/web/e2e/fixtures', './fixtures');
    const mutants = mutations.map(({ title, find, replace }, index) => {
      assert.ok(fixture.includes(find), `Mutation must remove a real recording path: ${find}`);
      const folder = join(directory, `mutant-${index}`);
      mkdirSync(folder);
      writeFileSync(join(folder, 'fixtures.ts'), fixture.replace(find, replace));
      writeFileSync(join(folder, 'guard.cases.ts'), mutantCases);
      return { title, folder, grep: `(^| )${escapeRegExp(title)}$` };
    });
    // One child run serves every mutant, each in its own project, so the servers start once.
    const config = join(directory, 'playwright.config.ts');
    writeFileSync(
      config,
      `import base from ${JSON.stringify(join(root, 'tooling/console-guard/playwright.config.ts'))};
const mutants = ${JSON.stringify(mutants)};
export default { ...base, projects: mutants.map(({ folder, grep }, index) => ({
  ...base.projects[0], name: 'mutant-' + index, testDir: folder, grep: new RegExp(grep),
})) };
`,
    );
    const mutant = runChild(config, join(directory, 'mutation-results'));
    assert.equal(mutant.child.status, 0, mutant.child.stderr);
    assert.equal(mutant.report.stats.expected, mutations.length);
    assert.deepEqual(
      mutant.cases.map(({ title }) => title).sort(),
      mutations.map(({ title }) => title).sort(),
    );
    mutations.forEach(({ title }) => {
      const guard = failures.find((failure) => failure.title === title)?.guard;
      assert.throws(
        () =>
          rejectViolation(
            mutant.cases.find((entry) => entry.title === title),
            guard,
          ),
        new RegExp(`${escapeRegExp(title)} must fail`),
      );
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
