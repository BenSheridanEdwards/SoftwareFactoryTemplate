import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const LOG_DIRECTORY = '.cache/factory-usage';

function summarize(tool, diagnostics) {
  const rules = Object.groupBy(diagnostics, (diagnostic) => diagnostic.rule);
  return {
    tool,
    total: diagnostics.length,
    rules: Object.fromEntries(
      Object.entries(rules).map(([rule, entries]) => [
        rule,
        {
          count: entries.length,
          files: [...new Set(entries.map((entry) => entry.file).filter(Boolean))].sort(),
        },
      ]),
    ),
  };
}

export function parseBiome(json) {
  return summarize(
    'biome',
    json.diagnostics
      .filter((entry) => ['error', 'warning', 'fatal'].includes(entry.severity))
      .map((entry) => ({ rule: entry.category || 'unknown', file: entry.location?.path })),
  );
}

export function parseOxlint(json, tool = 'oxlint') {
  return summarize(
    tool,
    json.diagnostics
      .filter((entry) => ['error', 'warning'].includes(entry.severity))
      .map((entry) => ({ rule: entry.code || 'unknown', file: entry.filename })),
  );
}

function optionalGit(git, ...args) {
  try {
    return git(...args).trim() || null;
  } catch {
    return null;
  }
}

function attribution(env) {
  const agent = env.CODEX_THREAD_ID
    ? 'codex'
    : env.CLAUDECODE
      ? 'claude'
      : env.CURSOR_AGENT
        ? 'cursor'
        : null;
  return {
    agent,
    model:
      agent === 'codex'
        ? env.CODEX_MODEL || null
        : agent === 'claude'
          ? env.ANTHROPIC_MODEL || null
          : null,
  };
}

export function recordBypass({ guard, input, env, git, append, now }) {
  if (env.FACTORY_USAGE_LOG === '0') return;
  const command = JSON.parse(input).tool_input?.command;
  if (typeof command !== 'string') return;
  append(
    `${JSON.stringify({ schema: 1, event: 'blocked-bypass', timestamp: now().toISOString(), branch: optionalGit(git, 'symbolic-ref', '--quiet', '--short', 'HEAD'), head: optionalGit(git, 'rev-parse', '--verify', 'HEAD'), ...attribution(env), guard, command })}\n`,
  );
}

export function record({ exitCode, env, git, run, append, now }) {
  if (env.FACTORY_USAGE_LOG === '0') return;
  const metadata = attribution(env);
  const tools = [
    parseBiome(JSON.parse(run('biome'))),
    parseOxlint(JSON.parse(run('oxlint-policy')), 'oxlint-policy'),
    parseOxlint(JSON.parse(run('oxlint'))),
  ];
  const value = {
    schema: 1,
    timestamp: now().toISOString(),
    branch: optionalGit(git, 'symbolic-ref', '--quiet', '--short', 'HEAD'),
    attempt: git('write-tree').trim(),
    head: optionalGit(git, 'rev-parse', '--verify', 'HEAD'),
    ...metadata,
    passed: exitCode === 0,
    hookExitCode: exitCode,
    tools,
    total: tools.reduce((total, tool) => total + tool.total, 0),
  };
  append(`${JSON.stringify(value)}\n`);
}

function run(tool) {
  const args =
    tool === 'biome'
      ? [
          'exec',
          'biome',
          'check',
          '--error-on-warnings',
          '--staged',
          '--no-errors-on-unmatched',
          '--reporter=json',
          '--max-diagnostics=none',
          '.',
        ]
      : [
          'exec',
          'env',
          '-u',
          'NAPI_RS_NATIVE_LIBRARY_PATH',
          '-u',
          'VP_VERSION',
          '-u',
          'OXLINT_TSGOLINT_PATH',
          'oxlint',
          '--no-ignore',
          '--config',
          tool === 'oxlint-policy' ? 'oxlint.config.ts' : '.oxlintrc.json',
          '--deny-warnings',
          '--format=json',
        ];
  const result = spawnSync('pnpm', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.signal || result.status === null)
    throw result.error || new Error('Linter interrupted');
  return result.stdout;
}

export function runCli(argv, dependencies = {}) {
  try {
    const bypass = argv.indexOf('--blocked-bypass');
    const index = argv.indexOf('--hook-exit');
    const exitCode = Number(argv[index + 1]);
    if (bypass < 0 && (index < 0 || !Number.isInteger(exitCode) || exitCode < 0)) return 0;
    const options = {
      exitCode,
      env: process.env,
      git: (...args) =>
        execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
      run,
      append: (line) => {
        const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
        const directory = `${root}/${LOG_DIRECTORY}`;
        mkdirSync(directory, { recursive: true });
        appendFileSync(`${directory}/lint-runs.jsonl`, line);
      },
      now: () => new Date(),
      ...dependencies,
    };
    if (bypass >= 0)
      recordBypass({
        ...options,
        guard: argv[bypass + 1],
        input: dependencies.input ?? readFileSync(0, 'utf8'),
      });
    else record(options);
  } catch {
    // Telemetry cannot change whether the hook accepts the staged tree.
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(process.argv.slice(2));
}
