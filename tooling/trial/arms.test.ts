/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  armsFailures,
  decideVerdict,
  GATED_TASK,
  median,
  PLAIN_SCRIPTS,
  PLAIN_TASK,
  plainPackageJson,
  plainScaffold,
  REPORT_PATH,
  readArm,
  renderArms,
  STRIPPED_PATHS,
  summarizeArm,
  transplant,
  writeReport,
} from './arms.mjs';
import { validateTask } from './task.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const RECORD = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/todo-01.json'), 'utf8'));
const MANIFEST = {
  name: 'scaffold',
  scripts: {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
    typecheck: 'tsc',
    format: 'biome format --write .',
    e2e: 'playwright test',
    'e2e:install': 'playwright install',
    'lint:policy': 'oxlint',
    verify: 'pnpm lint:policy && pnpm test',
    prepare: 'husky',
  },
};

let caseDir: string;
let root: string;

const put = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const commit = (cwd: string, message: string) => {
  git(cwd, 'add', '-A');
  git(
    cwd,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-q',
    '-m',
    message,
  );
  return git(cwd, 'rev-parse', 'HEAD');
};

/** A checkout whose one commit holds every gate path, a manifest and a rule doc. */
function scaffoldRepo() {
  git(caseDir, 'init', '-q', '--initial-branch=main', root);
  STRIPPED_PATHS.forEach((path) => {
    put(join(root, path.includes('.') ? path : `${path}/gate.txt`), 'gate\n');
  });
  put(join(root, 'package.json'), `${JSON.stringify(MANIFEST, null, 2)}\n`);
  put(join(root, 'AGENTS.md'), '# Rules\n');
  return commit(root, 'chore: scaffold');
}

const gatedRecord = (number: number, rev: string) => ({
  ...RECORD,
  trial: { ...RECORD.trial, number, id: `todo-0${number}`, branch: `trial/todo-0${number}` },
  scaffold: { ...RECORD.scaffold, rev },
});

const plainRecord = (number: number, rev: string, patch: string | null = null) => ({
  ...RECORD,
  schema: 2,
  task: {
    name: PLAIN_TASK,
    definitionSha256: 'a'.repeat(64),
    target: null,
    checks: ['install', 'verify', 'e2e', 'scope'],
    land: 'showcase',
  },
  trial: {
    ...RECORD.trial,
    number,
    id: `todo-plain-0${number}`,
    branch: `trial/todo-plain-0${number}`,
  },
  prompt: { ...RECORD.prompt, path: 'tooling/trial/todo-plain-prompt.md' },
  scaffold: { ...RECORD.scaffold, rev },
  agent: { ...RECORD.agent, name: 'claude', modelSource: 'stream', reasoningEffort: null },
  run: { ...RECORD.run, tokenUsage: null },
  result: { ...RECORD.result, patch },
});

const lint = (config: string, findings: number) => ({
  config,
  exitCode: findings > 0 ? 1 : 0,
  files: 1,
  findings,
  rules: [],
});

const reviewOf = (
  record: { trial: { id: string }; result: { commit: string | null } },
  { wouldWant = 'yes', flags = 0, findings = 0, reviewer = 'claude' } = {},
) => ({
  schema: 1,
  id: record.trial.id,
  run: { agent: 'claude', status: 'failed', commit: record.result.commit, patch: null },
  reviewedAt: '2026-11-10T12:00:00.000Z',
  read: 'check',
  lint: { 'anti-slop': lint('.oxlintrc.json', findings), policy: lint('oxlint.config.ts', 0) },
  reviewer: {
    name: reviewer,
    cli: reviewer,
    version: '1.0.0',
    argv: [],
    promptSha256: 'b'.repeat(64),
    durationMs: 1,
    fake: false,
  },
  judgment: {
    wouldWant,
    why: 'A reason.',
    flags: Array.from({ length: flags }, () => ({
      group: 'noise',
      file: 'showcase/x/api/src/domain.ts',
      line: 1,
      note: 'A note.',
    })),
    praise: [],
  },
});

const runOf = (
  record: ReturnType<typeof gatedRecord>,
  options?: Parameters<typeof reviewOf>[1],
) => ({
  evidence: record,
  review: reviewOf(record, options),
});
const NUMBERS = [1, 2, 3];
const arm = (
  make: (number: number, rev: string) => ReturnType<typeof gatedRecord>,
  rev: string,
  options?: Parameters<typeof reviewOf>[1],
) => NUMBERS.map((number) => runOf(make(number, rev), options));

const writeRecords = (
  runs: readonly { evidence: { trial: { id: string } }; review: unknown }[],
  withReviews = true,
) => {
  runs.forEach(({ evidence, review }) => {
    put(join(root, 'docs/trials', `${evidence.trial.id}.json`), JSON.stringify(evidence));
    if (withReviews) {
      put(join(root, 'docs/trials', `${evidence.trial.id}.review.json`), JSON.stringify(review));
    }
  });
};

beforeEach(() => {
  caseDir = realpathSync(mkdtempSync(join(tmpdir(), 'arms-')));
  root = join(caseDir, 'checkout');
});

afterEach(() => {
  rmSync(caseDir, { recursive: true, force: true });
});

describe('plainPackageJson', () => {
  it('keeps the run and build scripts and replaces the gates with the plain verify', () => {
    const plain = JSON.parse(plainPackageJson(JSON.stringify(MANIFEST)));

    expect(plain.scripts).toEqual({
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
      typecheck: 'tsc',
      format: 'biome format --write .',
      e2e: 'playwright test',
      'e2e:install': 'playwright install',
      ...PLAIN_SCRIPTS,
    });
    expect(plain.name).toBe('scaffold');
  });

  it('names a script the plain checkout needs and the scaffold lacks', () => {
    const { e2e: _e2e, ...scripts } = MANIFEST.scripts;

    expect(() => plainPackageJson(JSON.stringify({ ...MANIFEST, scripts }))).toThrow(
      'package.json has no script e2e.',
    );
  });
});

describe('the plain arm on this repository', () => {
  it('strips paths that exist and keeps a verify that names only kept scripts', () => {
    expect(STRIPPED_PATHS.filter((path) => !existsSync(join(ROOT, path)))).toEqual([]);

    const { scripts } = JSON.parse(
      plainPackageJson(readFileSync(join(ROOT, 'package.json'), 'utf8')),
    );
    const named = [...PLAIN_SCRIPTS.verify.matchAll(/pnpm ([\w:-]+)/g)].map(([, name]) => name);

    expect(named.filter((name) => !Object.hasOwn(scripts, name))).toEqual([]);
    expect(Object.keys(scripts).filter((name) => /lint|arch|fallow|check/.test(name))).toEqual([
      'typecheck',
    ]);
  });

  it('gives the plain task the Todo task without the structure check', () => {
    const read = (name: string) =>
      validateTask(JSON.parse(readFileSync(join(import.meta.dirname, 'tasks', name), 'utf8')));
    const [todo, plain] = [read('todo.json'), read('todo-plain.json')];

    expect(plain).toEqual({
      ...todo,
      name: PLAIN_TASK,
      prompt: 'tooling/trial/todo-plain-prompt.md',
      checks: todo.checks.filter(({ name }: { name: string }) => name !== 'structure'),
    });
    expect(todo.name).toBe(GATED_TASK);
  });

  it('gives both arms the same brief and names no gate in the plain prompt', () => {
    const read = (name: string) => readFileSync(join(import.meta.dirname, name), 'utf8');
    const section = (text: string, from: string, to: string) =>
      text.slice(text.indexOf(from), to === '' ? undefined : text.indexOf(to));
    const [todo, plain] = [read('todo-prompt.md'), read('todo-plain-prompt.md')];

    [
      ['## What to build', '## Where it goes'],
      ['## The page', '## Done'],
      ['## Shared machine', ''],
    ].forEach(([from, to]) => {
      expect(section(plain, from, to)).toBe(section(todo, from, to));
      expect(section(plain, from, to)).toContain(from);
    });
    expect(plain).toContain('This checkout runs no lint gate and no architecture gate.');
    expect(plain).not.toMatch(/structure\.mjs|arch:|lint:|architecture\.mmd|every gate/);
  });
});

describe('plainScaffold', () => {
  it('makes the same child commit each time, without the gates', () => {
    const scaffold = scaffoldRepo();

    const plain = plainScaffold(root, 'HEAD');

    expect(plainScaffold(root, scaffold)).toBe(plain);
    expect(git(root, 'rev-parse', `${plain}^`)).toBe(scaffold);
    expect(git(root, 'ls-tree', '-r', '--name-only', plain).split('\n')).toEqual([
      'AGENTS.md',
      'package.json',
    ]);
    expect(JSON.parse(git(root, 'show', `${plain}:package.json`)).scripts.verify).toBe(
      PLAIN_SCRIPTS.verify,
    );
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(root, 'for-each-ref', 'refs/trials')).toBe('');
  });

  it('names the commit when asked, so git keeps it', () => {
    scaffoldRepo();

    const plain = plainScaffold(root, 'HEAD', { keepRef: true });

    expect(git(root, 'rev-parse', 'refs/trials/plain-scaffold')).toBe(plain);
  });

  it('fails when the scaffold lacks a gate path, so no gate stays by accident', () => {
    scaffoldRepo();
    git(root, 'rm', '-q', '.oxlintrc.json');
    commit(root, 'chore: move the config');

    expect(() => plainScaffold(root, 'HEAD')).toThrow(
      /has no \.oxlintrc\.json\. Update STRIPPED_PATHS/,
    );
  });
});

describe('transplant', () => {
  const RESULT = 'showcase/todo-plain-01/api/src/domain.ts';
  const workdir = () => join(caseDir, 'transplant');

  /** A plain run's record and patch, as the harness keeps them. */
  function plainRun() {
    const scaffold = scaffoldRepo();
    const plain = plainScaffold(root, scaffold, { keepRef: true });
    const clone = join(caseDir, 'agent');
    git(caseDir, 'clone', '-q', '--no-checkout', root, clone);
    git(clone, 'fetch', '-q', root, 'refs/trials/plain-scaffold');
    git(clone, 'checkout', '-q', '--detach', plain);
    put(join(clone, RESULT), 'export const done = true;\n');
    commit(clone, 'feat(showcase): add the result');
    const patch = execFileSync('git', ['format-patch', '--stdout', `${plain}..HEAD`], {
      cwd: clone,
      encoding: 'utf8',
    });
    put(join(root, 'docs/trials/todo-plain-01.patch'), patch);
    put(
      join(root, 'docs/trials/todo-plain-01.json'),
      JSON.stringify(plainRecord(1, plain, 'docs/trials/todo-plain-01.patch')),
    );
    commit(root, 'docs(trials): record the plain run');
    return scaffold;
  }

  it('puts the result on the gated scaffold and installs there', () => {
    const scaffold = plainRun();
    const installed: string[] = [];

    const clone = transplant({
      root,
      id: 'todo-plain-01',
      workdir: workdir(),
      install: (cwd: string) => installed.push(cwd),
    });

    expect(clone).toBe(join(workdir(), 'check'));
    expect(installed).toEqual([clone]);
    expect(git(clone, 'rev-parse', 'HEAD')).toBe(scaffold);
    expect(readFileSync(join(clone, RESULT), 'utf8')).toBe('export const done = true;\n');
    expect(existsSync(join(clone, '.oxlintrc.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(clone, 'package.json'), 'utf8')).scripts).toEqual(
      MANIFEST.scripts,
    );
  });

  it.each([
    [
      'a gated run',
      () =>
        put(join(root, 'docs/trials/todo-01.json'), JSON.stringify(gatedRecord(1, 'a'.repeat(40)))),
      'todo-01',
      'is not a todo-plain run',
    ],
    [
      'a run without a patch',
      () =>
        put(
          join(root, 'docs/trials/todo-plain-01.json'),
          JSON.stringify(plainRecord(1, 'a'.repeat(40))),
        ),
      'todo-plain-01',
      'kept no patch',
    ],
    [
      'a workdir that holds a clone',
      () => {
        plainRun();
        mkdirSync(join(workdir(), 'check'), { recursive: true });
      },
      'todo-plain-01',
      'Use an empty workdir',
    ],
  ])('refuses %s', (_case, arrange, id, message) => {
    arrange();

    expect(() => transplant({ root, id, workdir: workdir(), install: () => undefined })).toThrow(
      message,
    );
  });
});

describe('median', () => {
  it.each([
    [[], null],
    [[4], 4],
    [[9, 1, 5], 5],
    [[4, 1, 3, 2], 2.5],
  ])('of %j is %j', (values, expected) => {
    expect(median(values)).toBe(expected);
  });
});

describe('summarizeArm', () => {
  it('counts passes and wants and takes the medians of the reviews and the runs', () => {
    const runs = [
      runOf(gatedRecord(1, 'a'.repeat(40)), { wouldWant: 'yes', flags: 1, findings: 0 }),
      runOf(gatedRecord(2, 'a'.repeat(40)), { wouldWant: 'no', flags: 7, findings: 4 }),
      { evidence: gatedRecord(3, 'a'.repeat(40)), review: null },
    ];

    expect(summarizeArm(runs)).toEqual({
      runs: 3,
      passed: 0,
      wanted: 1,
      flags: 4,
      lint: 2,
      agentMinutes: RECORD.run.agentDurationMs / 60_000,
      costUsd: RECORD.run.costUsd,
    });
  });
});

describe('decideVerdict', () => {
  const summary = (passed: number, wanted: number, flags: number | null) => ({
    runs: 3,
    passed,
    wanted,
    flags,
    lint: 0,
    agentMinutes: 1,
    costUsd: 1,
  });

  it.each([
    ['fewer flags and as many passes and wants', summary(3, 3, 1), summary(3, 3, 4), 'supported'],
    ['equal flags', summary(3, 3, 2), summary(3, 3, 2), 'refuted'],
    ['more flags than the plain arm', summary(3, 2, 5), summary(3, 3, 1), 'refuted'],
    ['fewer flags and fewer passes', summary(2, 3, 1), summary(3, 3, 4), 'inconclusive'],
    ['fewer flags and fewer wants', summary(3, 1, 1), summary(3, 2, 4), 'inconclusive'],
    ['more flags and more wants', summary(3, 3, 5), summary(3, 1, 2), 'inconclusive'],
    ['no reviewed gated run', summary(3, 0, null), summary(3, 3, 2), 'inconclusive'],
  ])('with %s, the claim is %s', (_case, gated, plain, verdict) => {
    expect(decideVerdict(gated, plain)).toBe(verdict);
  });
});

describe('armsFailures', () => {
  const GATED = 'a'.repeat(40);
  const PLAIN = 'b'.repeat(40);
  const plainOf = () => PLAIN;
  const complete = () => ({ gated: arm(gatedRecord, GATED), plain: arm(plainRecord, PLAIN) });

  it('accepts three reviewed runs per arm on one model and a derived scaffold', () => {
    expect(armsFailures(complete(), plainOf)).toEqual([]);
  });

  it('names each reason the comparison proves nothing', () => {
    const { gated, plain } = complete();
    const fake = {
      ...gated[0],
      evidence: { ...gated[0].evidence, agent: { ...RECORD.agent, fake: true } },
    };
    const otherModel = {
      ...gated[1],
      evidence: { ...gated[1].evidence, agent: { ...RECORD.agent, resolvedModel: 'other-model' } },
    };
    const otherReviewer = runOf(plainRecord(1, PLAIN), { reviewer: 'codex' });
    const unreviewed = { ...plain[1], review: null };

    expect(
      armsFailures(
        { gated: [fake, otherModel], plain: [otherReviewer, unreviewed, plain[2]] },
        () => GATED,
      ),
    ).toEqual([
      'The gated arm has 2 runs; it needs 3.',
      'todo-01 ran a fake agent.',
      'todo-plain-02 has no review.',
      `The runs used 2 models: ${RECORD.agent.resolvedModel}, other-model.`,
      'The reviews used 2 reviewers.',
      `The plain scaffold ${PLAIN} is not the gated scaffold ${GATED} without its gates (${GATED}).`,
    ]);
  });

  it('names an arm that ran on two scaffolds', () => {
    const { gated, plain } = complete();
    const moved = runOf(gatedRecord(3, 'c'.repeat(40)));
    const movedPlain = runOf(plainRecord(3, 'd'.repeat(40)));

    expect(
      armsFailures(
        { gated: [gated[0], gated[1], moved], plain: [plain[0], plain[1], movedPlain] },
        plainOf,
      ),
    ).toEqual(['The gated runs used 2 scaffolds.', 'The plain runs used 2 scaffolds.']);
  });
});

describe('renderArms', () => {
  it('lists each run, each arm and the verdict', () => {
    const arms = {
      gated: arm(gatedRecord, 'a'.repeat(40), { flags: 1 }),
      plain: arm(plainRecord, 'b'.repeat(40), { wouldWant: 'no', flags: 6, findings: 12 }),
    };

    const report = renderArms(arms, []);

    expect(report).toContain('| `todo-01` | gated | failed | yes | 1 | 0 | 20 | 8.2 | 1.38 |');
    expect(report).toContain(
      '| `todo-plain-03` | plain | failed | no | 6 | 12 | 20 | 8.2 | 1.38 |',
    );
    expect(report).toContain('| gated | 0 of 3 | 3 of 3 | 1 | 0 | 8.2 | 1.38 |');
    expect(report).toContain('| plain | 0 of 3 | 0 of 3 | 6 | 12 | 8.2 | 1.38 |');
    expect(report).toContain('**The claim is supported.**');
    expect(report.endsWith('lower.\n')).toBe(true);
  });

  it('gives no verdict for an incomplete comparison and shows a missing review', () => {
    const record = gatedRecord(1, 'a'.repeat(40));
    const unmeasured = { ...record, run: { ...record.run, agentDurationMs: null, costUsd: null } };

    const report = renderArms({ gated: [{ evidence: unmeasured, review: null }], plain: [] }, [
      'The plain arm has 0 runs; it needs 3.',
    ]);

    expect(report).toContain('| `todo-01` | gated | failed | n/a | n/a | n/a | 20 | n/a | n/a |');
    expect(report).toContain('| plain | 0 of 0 | 0 of 0 | n/a | n/a | n/a | n/a |');
    expect(report).toContain(
      'The comparison is incomplete, so it gives no verdict.\n\n- The plain arm has 0 runs; it needs 3.\n',
    );
    expect(report).not.toContain('The claim is');
  });
});

describe('writeReport', () => {
  it('reads both arms from the records and proves the plain scaffold from the gated one', () => {
    const scaffold = scaffoldRepo();
    const plain = plainScaffold(root, scaffold);
    writeRecords(arm(gatedRecord, scaffold, { flags: 2 }));
    writeRecords(arm(plainRecord, plain, { flags: 2 }));
    put(join(root, 'docs/trials/notes-01.review.json'), '{}');

    expect(readArm(root, PLAIN_TASK, 'claude').map(({ evidence }) => evidence.trial.id)).toEqual([
      'todo-plain-01',
      'todo-plain-02',
      'todo-plain-03',
    ]);
    expect(readArm(root, GATED_TASK, 'codex')).toEqual([]);
    expect(writeReport(root)).toEqual([]);
    expect(readFileSync(join(root, REPORT_PATH), 'utf8')).toContain('**The claim is refuted.**');
  });

  it('reports a plain scaffold that another commit made, and runs without reviews', () => {
    const scaffold = scaffoldRepo();
    put(join(root, 'AGENTS.md'), '# Other rules\n');
    const other = commit(root, 'docs: change the rules');
    writeRecords(arm(gatedRecord, scaffold));
    writeRecords(arm(plainRecord, other), false);

    const failures = writeReport(root);

    expect(failures).toEqual([
      'todo-plain-01 has no review.',
      'todo-plain-02 has no review.',
      'todo-plain-03 has no review.',
      expect.stringContaining(`The plain scaffold ${other} is not the gated scaffold ${scaffold}`),
    ]);
    expect(readFileSync(join(root, REPORT_PATH), 'utf8')).toContain('gives no verdict');
  });

  it('reports a gated scaffold that this checkout cannot strip', () => {
    const scaffold = scaffoldRepo();
    git(root, 'rm', '-q', '.oxlintrc.json');
    const moved = commit(root, 'chore: move the config');
    writeRecords(arm(gatedRecord, moved));
    writeRecords(arm(plainRecord, scaffold));

    expect(writeReport(root)).toEqual([expect.stringContaining('has no .oxlintrc.json')]);
  });

  it('writes an incomplete report when no record exists', () => {
    mkdirSync(join(root, 'docs/trials'), { recursive: true });

    expect(writeReport(root)).toEqual([
      'The gated arm has 0 runs; it needs 3.',
      'The plain arm has 0 runs; it needs 3.',
    ]);
  });
});
