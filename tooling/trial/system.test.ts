/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listeners, systemDeps } from './system.mjs';

const SYSTEM = join(import.meta.dirname, 'system.mjs');
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trial-system-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * `listeners(port, proc)` in a Node process whose PATH is `path` alone; a
 * child reads the real environment, which a Jest test's `process.env` is not.
 */
function listenersWith(path: string, port: number, proc: string): number[] {
  const script = `import { listeners } from ${JSON.stringify(SYSTEM)};
console.log(JSON.stringify(listeners(${port}, ${JSON.stringify(proc)})));`;
  const printed = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { PATH: path },
    encoding: 'utf8',
  });
  return JSON.parse(printed);
}

/** A process table whose socket table cannot be read, as in a hardened sandbox. */
function unreadableProc() {
  const proc = join(dir, 'proc');
  mkdirSync(join(proc, 'net/tcp'), { recursive: true });
  return proc;
}

describe('listeners', () => {
  it('finds the process listening on a port', async () => {
    const server: Server = await new Promise((done) => {
      const listening = createServer().listen(0, '127.0.0.1', () => done(listening));
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    const { port } = address;

    try {
      expect(listeners(port)).toEqual([process.pid]);
    } finally {
      server.close();
    }
  });

  it('asks lsof for the listeners on a port when the process table cannot be read', () => {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'lsof'),
      '#!/bin/sh\n[ "$*" = "-t -iTCP:5183 -sTCP:LISTEN" ] && printf "4242\\n4243\\n"\n',
    );
    chmodSync(join(bin, 'lsof'), 0o755);

    expect(listenersWith(bin, 5183, unreadableProc())).toEqual([4242, 4243]);
  });

  it('finds none when neither the process table nor lsof is there', () => {
    expect(listenersWith(join(dir, 'empty'), 5183, unreadableProc())).toEqual([]);
  });
});

describe('exec', () => {
  it('keeps multibyte characters whole when they span output chunks', async () => {
    // One leading byte puts every two-byte `é` across each 64 KB pipe chunk boundary.
    const text = `a${'é'.repeat(200_000)}`;
    const print =
      "let text = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => text += chunk); process.stdin.on('end', () => { process.stdout.write(text); process.stderr.write(text); });";

    const run = await systemDeps().exec([process.execPath, '-e', print], { cwd: dir, input: text });

    expect(run.code).toBe(0);
    expect(run.stdout === text).toBe(true);
    expect(run.output.includes('�')).toBe(false);
    expect(run.output.length).toBe(text.length * 2);
  });
  it('decodes a UTF-8 character split across delayed writes on each pipe', async () => {
    const print =
      'process.stdout.write(Buffer.from([0xc3])); process.stderr.write(Buffer.from([0xe2, 0x82])); setTimeout(() => { process.stdout.write(Buffer.from([0xa9])); process.stderr.write(Buffer.from([0xac])); }, 30);';
    const run = await systemDeps().exec([process.execPath, '-e', print], { cwd: dir });
    expect(run.code).toBe(0);
    expect(run.stdout).toBe('é');
    expect(run.output).toContain('é');
    expect(run.output).toContain('€');
    expect(run.output).not.toContain('�');
  });

  it('keeps stdoutFile bytes raw while decoding stderr', async () => {
    const stdoutFile = join(dir, 'stdout.bin');
    const run = await systemDeps().exec(
      [
        process.execPath,
        '-e',
        "process.stdout.write(Buffer.from([0xff, 0xc3, 0xa9])); process.stderr.write('é');",
      ],
      { cwd: dir, stdoutFile },
    );
    expect(run.code).toBe(0);
    expect([...readFileSync(stdoutFile)]).toEqual([255, 195, 169]);
    expect(run.stdout).toBe('');
    expect(run.output).toBe('é');
  });
});

describe('agent environment', () => {
  it('allows only the five Codex configuration and authentication variables', () => {
    const codex = {
      CODEX_HOME: '/codex-home',
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'https://example.test',
      OPENAI_ORG_ID: 'test-org',
      OPENAI_PROJECT: 'test-project',
    };
    const printed = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { agentEnv } from ${JSON.stringify(SYSTEM)}; console.log(JSON.stringify(agentEnv({})));`,
      ],
      {
        env: { ...process.env, ...codex, OPENAI_MODEL: 'unrecorded', CODEX_THREAD_ID: 'previous' },
        encoding: 'utf8',
      },
    );
    const actual = JSON.parse(printed);
    expect(actual).toMatchObject(codex);
    expect(actual.OPENAI_MODEL).toBeUndefined();
    expect(actual.CODEX_THREAD_ID).toBeUndefined();
  });
});
