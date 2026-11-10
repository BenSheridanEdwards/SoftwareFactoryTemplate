#!/usr/bin/env node
/**
 * The two-arm test of the factory claim (ADR 0127). The gated arm is the Todo
 * trial. The plain arm builds the same brief on a scaffold that keeps the
 * written rules and has no lint or architecture gate.
 *
 *   node tooling/trial/arms.mjs scaffold --scaffold <rev>              # print the plain scaffold commit
 *   node tooling/trial/arms.mjs transplant --id <id> --workdir <dir>   # a plain result on the gated scaffold
 *   node tooling/trial/arms.mjs report [--agent claude|codex]          # write docs/trials/arms.md
 *
 * `plainPackageJson`, `summarizeArm`, `decideVerdict` and `renderArms` are pure.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validateEvidence } from './evidence.mjs';
import { validateReview } from './review.mjs';

const HARNESS_ROOT = resolve(import.meta.dirname, '../..');
const TRIALS = 'docs/trials';
export const REPORT_PATH = `${TRIALS}/arms.md`;
export const GATED_TASK = 'todo';
export const PLAIN_TASK = 'todo-plain';
const RUNS_PER_ARM = 3;
const SCAFFOLD_REF = 'refs/trials/plain-scaffold';

/** The lint and architecture gates: their configs, plugins, entry scripts and hooks. */
export const STRIPPED_PATHS = [
  '.husky',
  '.fallowrc.jsonc',
  '.oxlintrc.json',
  'oxlint.config.ts',
  'scripts/check-styles.mjs',
  'scripts/check-suppressions.mjs',
  'scripts/fallow-audit.sh',
  'tooling/architecture',
  'tooling/oxlint-general-rules.ts',
  'tooling/oxlint-plugin-naming.js',
  'tooling/oxlint-plugin-policy.js',
  'tooling/oxlint-plugin-react-doctor.js',
  'vendor/anti-slop',
];

/** The scripts a plain checkout keeps; every gate script goes. */
const KEPT_SCRIPTS = ['dev', 'build', 'preview', 'typecheck', 'format', 'e2e', 'e2e:install'];

/** What the plain arm's `pnpm verify` proves: types, unit tests and the build. */
export const PLAIN_SCRIPTS = {
  test: 'jest --selectProjects web api',
  verify: 'pnpm typecheck && pnpm test && pnpm build',
};

/** A fixed author makes the plain scaffold a pure function of its parent commit. */
const AUTHOR = { name: 'trial-harness', email: 'trial-harness@users.noreply.github.com' };

const git = (cwd, args, options = {}) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', ...options }).trim();

/** The scaffold's `package.json` with the gate scripts removed, as Biome formats it. */
export function plainPackageJson(text) {
  const manifest = JSON.parse(text);
  const kept = Object.entries(manifest.scripts).filter(([name]) => KEPT_SCRIPTS.includes(name));
  const missing = KEPT_SCRIPTS.filter((name) => !Object.hasOwn(manifest.scripts, name));
  if (missing.length > 0) {
    throw new Error(`package.json has no script ${missing.join(', ')}.`);
  }
  const scripts = { ...Object.fromEntries(kept), ...PLAIN_SCRIPTS };
  return `${JSON.stringify({ ...manifest, scripts }, null, 2)}\n`;
}

const existsAt = (root, rev, path) => {
  try {
    execFileSync('git', ['cat-file', '-e', `${rev}:${path}`], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/**
 * The plain scaffold: a child commit of `rev` without the gates. The same
 * `rev` always gives the same commit, so the report can prove a plain run's
 * scaffold from the gated one. `keepRef` also names it so git keeps it.
 *
 * @param {string} root
 * @param {string} rev
 * @param {{ keepRef?: boolean }} [options]
 * @returns {string}
 */
export function plainScaffold(root, rev, { keepRef = false } = {}) {
  const scaffold = git(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
  const absent = STRIPPED_PATHS.filter((path) => !existsAt(root, scaffold, path));
  if (absent.length > 0) {
    throw new Error(
      `The scaffold ${scaffold} has no ${absent.join(', ')}. Update STRIPPED_PATHS in tooling/trial/arms.mjs to name the gates it has.`,
    );
  }
  const folder = mkdtempSync(join(tmpdir(), 'plain-scaffold-'));
  const date = git(root, ['show', '-s', '--format=%cI', scaffold]);
  const env = {
    ...process.env,
    GIT_INDEX_FILE: join(folder, 'index'),
    GIT_AUTHOR_NAME: AUTHOR.name,
    GIT_AUTHOR_EMAIL: AUTHOR.email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: AUTHOR.name,
    GIT_COMMITTER_EMAIL: AUTHOR.email,
    GIT_COMMITTER_DATE: date,
  };
  try {
    git(root, ['read-tree', scaffold], { env });
    git(root, ['rm', '-r', '-f', '-q', '--cached', '--', ...STRIPPED_PATHS], { env });
    const manifest = git(root, ['hash-object', '-w', '--stdin'], {
      env,
      input: plainPackageJson(git(root, ['show', `${scaffold}:package.json`])),
    });
    git(root, ['update-index', '--cacheinfo', `100644,${manifest},package.json`], { env });
    const tree = git(root, ['write-tree'], { env });
    const message = `chore(trial): plain scaffold of ${scaffold}\n\nThe written rules without the lint and architecture gates (ADR 0127).`;
    const commit = git(root, ['commit-tree', tree, '-p', scaffold, '-m', message], { env });
    if (keepRef) git(root, ['update-ref', SCAFFOLD_REF, commit]);
    return commit;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const taskOf = (evidence) => (evidence.schema === 2 ? evidence.task.name : GATED_TASK);
const agentOf = (evidence) => evidence.agent.name ?? 'claude';
const installFrozen = (cwd) =>
  execFileSync('pnpm', ['install', '--frozen-lockfile'], { cwd, stdio: 'inherit' });

/**
 * Puts a plain run's result on the gated scaffold, in `<workdir>/check`, so
 * `review.mjs` lints and judges it in the same tree as a gated run.
 *
 * @param {{ root: string, id: string, workdir: string, install?: (cwd: string) => void }} options
 * @returns {string} the clone that holds the result
 */
export function transplant({ root, id, workdir, install = installFrozen }) {
  const evidence = validateEvidence(readJson(join(root, TRIALS, `${id}.json`)));
  if (taskOf(evidence) !== PLAIN_TASK) {
    throw new Error(
      `${id} is not a ${PLAIN_TASK} run. A gated run is reviewed in its own workdir.`,
    );
  }
  if (evidence.result.patch === null) {
    throw new Error(`${id} kept no patch, so it has no result to review.`);
  }
  const clone = join(workdir, 'check');
  if (existsSync(clone)) {
    throw new Error(`${clone} exists. Use an empty workdir for each transplant.`);
  }
  mkdirSync(workdir, { recursive: true });
  const gated = git(root, ['rev-parse', '--verify', '--quiet', `${evidence.scaffold.rev}^`]);
  git(root, ['clone', '-q', '--no-checkout', root, clone]);
  git(clone, ['checkout', '-q', '--detach', gated]);
  git(clone, ['apply', join(root, evidence.result.patch)]);
  install(clone);
  return clone;
}

/** The middle value, or the mean of the two middle values; null for no value. */
export function median(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return null;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const lintFindings = (review) => review.lint['anti-slop'].findings + review.lint.policy.findings;
const present = (values) => values.filter((value) => value !== null);

/**
 * @typedef {{ evidence: import('./evidence.mjs').TrialEvidence, review: import('./review.mjs').Review | null }} ArmRun
 * @typedef {ReturnType<typeof summarizeArm>} ArmSummary
 * @param {readonly ArmRun[]} runs
 */
export function summarizeArm(runs) {
  const reviews = present(runs.map(({ review }) => review));
  return {
    runs: runs.length,
    passed: runs.filter(({ evidence }) => evidence.result.status === 'passed').length,
    wanted: reviews.filter(({ judgment }) => judgment.wouldWant === 'yes').length,
    flags: median(reviews.map(({ judgment }) => judgment.flags.length)),
    lint: median(reviews.map(lintFindings)),
    agentMinutes: median(
      present(runs.map(({ evidence }) => evidence.run.agentDurationMs)).map((ms) => ms / 60_000),
    ),
    costUsd: median(present(runs.map(({ evidence }) => evidence.run.costUsd))),
  };
}

/**
 * The decision rule, fixed before any run (ADR 0127). The claim holds when the
 * gated arm passes and is wanted at least as often and gets fewer reviewer
 * flags. It fails when the plain arm matches or beats it on all three.
 *
 * @param {ArmSummary} gated
 * @param {ArmSummary} plain
 * @returns {'supported' | 'refuted' | 'inconclusive'}
 */
export function decideVerdict(gated, plain) {
  if (gated.flags === null || plain.flags === null) return 'inconclusive';
  if (gated.passed >= plain.passed && gated.wanted >= plain.wanted && gated.flags < plain.flags) {
    return 'supported';
  }
  if (plain.passed >= gated.passed && plain.wanted >= gated.wanted && plain.flags <= gated.flags) {
    return 'refuted';
  }
  return 'inconclusive';
}

const distinct = (values) => [...new Set(values)];

/**
 * Reasons the comparison proves nothing yet: a missing run or review, a fake
 * agent, a second model or reviewer, or a plain scaffold that is not the
 * gated scaffold without its gates.
 *
 * @param {{ gated: readonly ArmRun[], plain: readonly ArmRun[] }} arms
 * @param {(gatedRev: string) => string} plainOf
 * @returns {string[]}
 */
export function armsFailures({ gated, plain }, plainOf) {
  const all = [...gated, ...plain];
  const revs = (runs) => distinct(runs.map(({ evidence }) => evidence.scaffold.rev));
  const [gatedRevs, plainRevs] = [revs(gated), revs(plain)];
  const models = distinct(all.map(({ evidence }) => evidence.agent.resolvedModel));
  const reviewers = distinct(present(all.map(({ review }) => review)).map((r) => r.reviewer.name));
  const derived = gatedRevs.length === 1 && plainRevs.length === 1 && plainOf(gatedRevs[0]);
  return [
    ...Object.entries({ gated, plain })
      .filter(([, runs]) => runs.length !== RUNS_PER_ARM)
      .map(([arm, runs]) => `The ${arm} arm has ${runs.length} runs; it needs ${RUNS_PER_ARM}.`),
    ...all
      .filter(({ evidence }) => evidence.agent.fake)
      .map(({ evidence }) => `${evidence.trial.id} ran a fake agent.`),
    ...all
      .filter(({ review }) => review === null)
      .map(({ evidence }) => `${evidence.trial.id} has no review.`),
    ...[
      [gatedRevs.length > 1, `The gated runs used ${gatedRevs.length} scaffolds.`],
      [plainRevs.length > 1, `The plain runs used ${plainRevs.length} scaffolds.`],
      [models.length > 1, `The runs used ${models.length} models: ${models.join(', ')}.`],
      [reviewers.length > 1, `The reviews used ${reviewers.length} reviewers.`],
      [
        derived !== false && derived !== plainRevs[0],
        `The plain scaffold ${plainRevs[0]} is not the gated scaffold ${gatedRevs[0]} without its gates (${derived}).`,
      ],
    ]
      .filter(([fails]) => fails)
      .map(([, reason]) => reason),
  ];
}

const shown = (value, digits = 1) => (value === null ? 'n/a' : String(+value.toFixed(digits)));
const table = (head, rows) =>
  [head, head.map(() => '---'), ...rows].map((row) => `| ${row.join(' | ')} |`).join('\n');

const runRow = (arm, { evidence, review }) => [
  `\`${evidence.trial.id}\``,
  arm,
  evidence.result.status,
  review?.judgment.wouldWant ?? 'n/a',
  review ? String(review.judgment.flags.length) : 'n/a',
  review ? String(lintFindings(review)) : 'n/a',
  shown(evidence.run.turns, 0),
  shown(evidence.run.agentDurationMs === null ? null : evidence.run.agentDurationMs / 60_000),
  shown(evidence.run.costUsd, 2),
];

const armRow = (arm, summary) => [
  arm,
  `${summary.passed} of ${summary.runs}`,
  `${summary.wanted} of ${summary.runs}`,
  shown(summary.flags),
  shown(summary.lint),
  shown(summary.agentMinutes),
  shown(summary.costUsd, 2),
];

const VERDICTS = {
  supported:
    'The gated arm passed and was wanted at least as often as the plain arm, and its median reviewer flag count is lower.',
  refuted:
    'The plain arm passed and was wanted at least as often as the gated arm, and its median reviewer flag count is equal or lower.',
  inconclusive: 'The measures disagree, or a review is missing. Neither rule holds.',
};

/**
 * @param {{ gated: readonly ArmRun[], plain: readonly ArmRun[] }} arms
 * @param {readonly string[]} failures
 */
export function renderArms({ gated, plain }, failures) {
  const [gatedSummary, plainSummary] = [summarizeArm(gated), summarizeArm(plain)];
  const verdict = failures.length > 0 ? null : decideVerdict(gatedSummary, plainSummary);
  const summaryHead = ['Arm', 'Passed', 'Would want', 'Median flags', 'Median lint findings'];
  return [
    '<!-- Generated by tooling/trial/arms.mjs (node tooling/trial/arms.mjs report). Edit the generator, then regenerate. -->',
    '# Gated and plain arms',
    'This report tests the factory claim of ADR 0127. Both arms build the Todo brief with the same model. The gated arm has every gate. The plain arm has the written rules, and its scaffold has no lint or architecture gate. One reviewer reads each result on the gated scaffold. The lint column counts the anti-slop and policy findings there.',
    '## Runs',
    table(
      ['Run', 'Arm', 'Status', 'Would want', 'Flags', 'Lint findings', 'Turns', 'Minutes', 'USD'],
      [...gated.map((run) => runRow('gated', run)), ...plain.map((run) => runRow('plain', run))],
    ),
    '## Arms',
    table(
      [...summaryHead, 'Median agent minutes', 'Median USD'],
      [armRow('gated', gatedSummary), armRow('plain', plainSummary)],
    ),
    '## Verdict',
    verdict === null
      ? [
          'The comparison is incomplete, so it gives no verdict.',
          '',
          ...failures.map((f) => `- ${f}`),
        ].join('\n')
      : `**The claim is ${verdict}.** ${VERDICTS[verdict]}`,
  ]
    .join('\n\n')
    .concat('\n');
}

/**
 * Every record of one arm in `docs/trials`, by trial number, with its review.
 *
 * @param {string} root
 * @param {string} task
 * @param {'claude' | 'codex'} agent
 * @returns {ArmRun[]}
 */
export function readArm(root, task, agent) {
  const dir = join(root, TRIALS);
  const names = existsSync(dir) ? readdirSync(dir) : [];
  return names
    .filter((name) => name.endsWith('.json') && !name.endsWith('.review.json'))
    .map((name) => validateEvidence(readJson(join(dir, name))))
    .filter((evidence) => taskOf(evidence) === task && agentOf(evidence) === agent)
    .toSorted((a, b) => a.trial.number - b.trial.number)
    .map((evidence) => {
      const path = join(dir, `${evidence.trial.id}.review.json`);
      return { evidence, review: existsSync(path) ? validateReview(readJson(path)) : null };
    });
}

/** Writes the report and returns the reasons it gives no verdict. */
export function writeReport(root, agent = 'claude') {
  const arms = { gated: readArm(root, GATED_TASK, agent), plain: readArm(root, PLAIN_TASK, agent) };
  const failures = armsFailures(arms, (rev) => {
    try {
      return plainScaffold(root, rev);
    } catch (error) {
      return error.message;
    }
  });
  writeFileSync(join(root, REPORT_PATH), renderArms(arms, failures));
  return failures;
}

const COMMANDS = {
  scaffold: ({ scaffold }) => {
    if (!scaffold) throw new Error('Pass --scaffold <rev>.');
    console.log(plainScaffold(HARNESS_ROOT, scaffold, { keepRef: true }));
  },
  transplant: ({ id, workdir }) => {
    if (!id || !workdir) throw new Error('Pass --id <trial id> and --workdir <dir>.');
    const clone = transplant({ root: HARNESS_ROOT, id, workdir: resolve(workdir) });
    console.log(`Result of ${id} on the gated scaffold: ${clone}`);
  },
  report: ({ agent }) => {
    if (!['claude', 'codex'].includes(agent)) throw new Error('--agent must be claude or codex');
    const failures = writeReport(HARNESS_ROOT, agent);
    console.log(`Wrote ${REPORT_PATH}`);
    if (failures.length > 0) {
      console.error(failures.join('\n'));
      process.exitCode = 1;
    }
  },
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        scaffold: { type: 'string' },
        id: { type: 'string' },
        workdir: { type: 'string' },
        agent: { type: 'string', default: 'claude' },
      },
    });
    const command = COMMANDS[positionals[0]];
    if (!command) throw new Error('Pass one command: scaffold, transplant or report.');
    command(values);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
