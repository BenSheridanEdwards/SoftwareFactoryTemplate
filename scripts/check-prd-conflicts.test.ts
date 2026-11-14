import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  coveredPaths,
  createNodeFilesystem,
  findPrdConflicts,
  parseBehaviours,
} from './check-prd-conflicts.mjs';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const SPEC = 'apps/web/e2e/todos.spec.ts';
const SOURCE = 'apps/web/src/routes/todos/TodosPage.tsx';
const COVERS = '- **Covers:** `apps/web/src/routes/todos/**`';
const SPEC_TEXT = [
  "test.describe('To-dos', () => {",
  "  test('adds a to-do through the api', async ({ page }) => {});",
  '  test("says so when the api fails", async ({ page }) => {});',
  "  test('keeps the visitor\\'s name', async ({ page }) => {});",
  "  test.skip('adds twice', async ({ page }) => {});",
  "  test.fixme('adds in French', async ({ page }) => {});",
  '});',
].join('\n');

/** An in-memory filesystem: `files` maps a repository-relative path to its content. */
function filesystemOf(files: Record<string, string>) {
  return {
    listTrackedFiles: () => Object.keys(files),
    readText: (path: string) => {
      if (!Object.hasOwn(files, path)) {
        throw new Error(`ENOENT: ${path}`);
      }
      return files[path];
    },
  };
}

function prd(...behaviours: string[]) {
  return ['# To-dos', COVERS, '## Intent', '', 'Keeps a to-do list.', '', '## Behaviours', '']
    .concat(behaviours)
    .concat(['', '## Out of scope', '', '- Proved by [ignored](../../nowhere.spec.ts)'])
    .join('\n');
}

const proof = (title: string, target = '../../apps/web/e2e/todos.spec.ts') =>
  `  - Proved by [${title}](${target})`;

function conflictsOf(prdText: string, extraFiles: Record<string, string> = {}) {
  return findPrdConflicts(
    filesystemOf({
      'docs/prd/todos.md': prdText,
      [SPEC]: SPEC_TEXT,
      [SOURCE]: '',
      ...extraFiles,
    }),
  );
}

describe('findPrdConflicts', () => {
  it('passes on the PRDs in this repository', () => {
    const filesystem = createNodeFilesystem(REPOSITORY_ROOT);
    expect(filesystem.listTrackedFiles()).toContain('docs/prd/greeting.md');
    expect(findPrdConflicts(filesystem)).toEqual([]);
  });

  it('passes when every behaviour names a test that exists in its spec', () => {
    const text = prd(
      '- **Adds a to-do.** The page shows the to-do.',
      '  The spaces around the name are trimmed.',
      proof('adds a to-do through the api'),
      '- **Reports a failure.** The page says the list could not load.',
      proof('says so when the api fails'),
      proof("keeps the visitor's name"),
    );
    expect(conflictsOf(text)).toEqual([]);
  });

  it('fails, naming the line, when a behaviour names no test', () => {
    const text = prd(
      '- **Adds a to-do.** The page shows the to-do.',
      proof('adds a to-do through the api'),
      '- **Remembers the name.** The page keeps the last name.',
    );
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/todos\.md:11 .*Remembers the name.*Proved by/),
    ]);
  });

  it('fails when a linked spec file does not exist', () => {
    const text = prd(
      '- **Adds a to-do.** The page shows the to-do.',
      proof('adds a to-do through the api', '../../apps/web/e2e/gone.spec.ts'),
    );
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/todos\.md:10 .*`apps\/web\/e2e\/gone\.spec\.ts`/),
    ]);
  });

  it('fails when a linked file exists but is not an E2E spec', () => {
    const unitTest = 'apps/web/src/routes/todos/TodosPage.test.tsx';
    const text = prd(
      '- **Adds a to-do.** The page shows the to-do.',
      proof('adds a to-do through the api', `../../${unitTest}`),
    );
    expect(conflictsOf(text, { [unitTest]: SPEC_TEXT })).toEqual([
      expect.stringContaining(`\`${unitTest}\``),
    ]);
  });

  it('fails when the linked spec has no test with that title', () => {
    const text = prd(
      '- **Adds a to-do.** The page shows the to-do.',
      proof('adds a to-do through the API'),
    );
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/todos\.md:10 .*"adds a to-do through the API"/),
    ]);
  });

  it('fails when the linked test is skipped, since a skipped test proves nothing', () => {
    const text = prd('- **Adds twice.** The page adds again.', proof('adds twice'));
    expect(conflictsOf(text)).toEqual([expect.stringContaining('"adds twice"')]);
  });

  it('fails when a PRD lists no behaviours', () => {
    const text = `# To-dos\n${COVERS}\n## Intent\n\nKeeps a to-do list.\n`;
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/todos\.md .*Behaviours/),
    ]);
  });

  it('counts only the list items under the Behaviours heading', () => {
    const text = [
      COVERS,
      '- **Adds a to-do.** The page shows the to-do.',
      proof('adds a to-do through the api'),
      '',
      '## Intent',
      '',
      'Keeps a to-do list.',
    ].join('\n');
    expect(conflictsOf(text)).toEqual([expect.stringContaining('lists no behaviours')]);
  });

  it('checks only the Markdown files directly in docs/prd/', () => {
    const files = {
      'docs/prd/archive/old.md': prd('- **Old.** Gone.'),
      'docs/notes.md': prd('- x'),
    };
    expect(
      conflictsOf(prd('- **Adds.** Hi.', proof('adds a to-do through the api')), files),
    ).toEqual([]);
  });

  it('fails, naming the line, when the linked test is marked fixme', () => {
    const text = prd('- **Adds in French.** Bonjour.', proof('adds in French'));
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/todos\.md:10 .*"adds in French"/),
    ]);
  });

  it.each([
    ['a line comment', "// test('adds later', async () => {});"],
    ['a block comment', "/* test('adds later', async () => {}); */"],
    ['a block comment over several lines', "/*\n  test('adds later', async () => {});\n*/"],
    ['a regular expression test call', "/adds/.test('adds later');"],
    ['a describe title', "test.describe('adds later', () => {});"],
  ])('fails when the linked title appears only in %s', (_, source) => {
    const text = prd('- **Adds later.** The page adds later.', proof('adds later'));
    expect(conflictsOf(text, { [SPEC]: source })).toEqual([
      expect.stringContaining('has no test with that title'),
    ]);
  });

  it.each([
    [
      'a describe.skip group',
      "test.describe.skip('Later', () => { test('adds later', async () => {}); });",
    ],
    [
      'a describe.fixme group',
      "test.describe.fixme('Later', () => { test('adds later', async () => {}); });",
    ],
    ['a test that skips itself', "test('adds later', async () => { test.skip(); });"],
    [
      'a test that skips itself on a condition',
      "test('adds later', async ({ browserName }) => { test.skip(browserName === 'webkit', 'flaky'); });",
    ],
    [
      'a group whose hook skips it',
      "test.describe('Later', () => { test.beforeEach(() => { test.fixme(); }); test('adds later', async () => {}); });",
    ],
    [
      'a file that skips every test',
      "test.skip(true, 'not yet');\ntest('adds later', async () => {});",
    ],
    [
      'a file that skips every test on a callback condition',
      "test.skip(({ browserName }) => browserName === 'webkit', 'flaky');\ntest('adds later', async () => {});",
    ],
    ['a test marked to fail', "test('adds later', async () => { test.fail(); });"],
    [
      'a group marked to fail on a condition',
      "test.describe('Later', () => { test.fail(true, 'known bug'); test('adds later', async () => {}); });",
    ],
    ['a test.fail test', "test.fail('adds later', async () => {});"],
    [
      'a test that testInfo skips',
      "test('adds later', async ({}, testInfo) => { testInfo.skip(); });",
    ],
    [
      'a test that testInfo marks to fail',
      "test('adds later', async ({}, testInfo) => { testInfo.fail(); });",
    ],
    [
      'a test that a renamed testInfo marks fixme on a condition',
      "test('adds later', async ({}, info) => { info.fixme(true, 'not yet'); });",
    ],
    [
      'a group that describe.skip skips through an alias',
      "const { describe } = test;\ndescribe.skip('Later', () => { test('adds later', async () => {}); });",
    ],
    [
      'a test whose annotation skips it',
      "test('adds later', { annotation: { type: 'skip' } }, async () => {});",
    ],
    [
      'a test whose annotation list marks it fixme',
      "test('adds later', { annotation: [{ type: 'issue' }, { type: 'fixme' }] }, async () => {});",
    ],
    [
      'a test whose annotation marks it to fail',
      "test('adds later', { annotation: { type: 'fail' } }, async () => {});",
    ],
    [
      'a group whose annotation skips it',
      "test.describe('Later', { annotation: { type: 'skip' } }, () => { test('adds later', async () => {}); });",
    ],
    [
      'a test whose annotation the check cannot read',
      "test('adds later', { annotation: annotations }, async () => {});",
    ],
    ['a test whose details the check cannot read', "test('adds later', details, async () => {});"],
    [
      'a test whose annotation type the check cannot read',
      "test('adds later', { annotation: { type: kind } }, async () => {});",
    ],
  ])('fails, saying the test does not run, when the linked title appears only in %s', (_, source) => {
    const text = prd('- **Adds later.** The page adds later.', proof('adds later'));
    expect(conflictsOf(text, { [SPEC]: source })).toEqual([
      expect.stringContaining('has a test with that title, but it does not run'),
    ]);
  });

  it('says why when the linked test exists but does not run', () => {
    const text = prd('- **Adds later.** The page adds later.', proof('adds later'));
    const source = "test('adds later', async () => { assert.fail('no'); });";
    expect(conflictsOf(text, { [SPEC]: source })).toEqual([
      'docs/prd/todos.md:10 names "adds later". `apps/web/e2e/todos.spec.ts` has a ' +
        'test with that title, but it does not run: it is a skip, fixme or fail test, or a ' +
        '`skip`, `fixme` or `fail` annotation or a `.skip`, `.fixme` or `.fail` call in its ' +
        'test, group or file stops it (ADR 0045). Make the test run, or link one that does.',
    ]);
  });

  it('fails when the linked title is a template literal with a substitution', () => {
    const title = `adds \${name}`;
    const text = prd('- **Adds later.** The page adds later.', proof(title));
    expect(conflictsOf(text, { [SPEC]: `test(\`${title}\`, async () => {});` })).toEqual([
      expect.stringContaining('has no test with that title'),
    ]);
  });

  it('counts a test beside a skipped one, a focused test and a template literal title', () => {
    const source = [
      "test.describe('To-dos', () => {",
      "  test('adds later', async () => { test.skip(); });",
      "  test('adds now', async () => {});",
      "  test.only('adds first', async () => {});",
      `  test(\`adds \${'in'} time\`, async () => {});`,
      '  test(`adds plainly`, async () => {});',
      '});',
    ].join('\n');
    const text = prd(
      '- **Adds.** The page adds.',
      proof('adds now'),
      proof('adds first'),
      proof('adds plainly'),
    );
    expect(conflictsOf(text, { [SPEC]: source })).toEqual([]);
  });

  it('counts a test with an issue annotation and a test with a skipped step', () => {
    const source = [
      "test('adds now', { annotation: { type: 'issue', description: '#68' } }, async () => {});",
      "test('adds later', async () => { await test.step.skip('x', async () => {}, { box: true }); });",
    ].join('\n');
    const text = prd('- **Adds.** The page adds.', proof('adds now'), proof('adds later'));
    expect(conflictsOf(text, { [SPEC]: source })).toEqual([]);
  });

  it('counts a test that runs beside a skipped test with the same title', () => {
    const source = [
      "test.skip('adds later', async () => {});",
      "test('adds later', async () => {});",
      "test.fixme('adds later', async () => {});",
    ].join('\n');
    const text = prd('- **Adds later.** The page adds later.', proof('adds later'));
    expect(conflictsOf(text, { [SPEC]: source })).toEqual([]);
  });

  it('counts a test beside a skipped test whose title is computed', () => {
    const source = [
      "const name = 'adds slowly';",
      `test.skip(\`adds \${'in'} time\`, async () => {});`,
      "test.fixme(name, { tag: '@slow' }, async () => {});",
      "test('adds later', async () => {});",
    ].join('\n');
    const text = prd('- **Adds later.** The page adds later.', proof('adds later'));
    expect(conflictsOf(text, { [SPEC]: source })).toEqual([]);
  });

  it.each([
    ['a tab', '\t'],
    ['four spaces', '    '],
    ['three spaces', '   '],
  ])('reads a proof indented by %s', (_, indent) => {
    const text = prd(
      '- **Adds a to-do.** The page shows the to-do.',
      `${indent}- Proved by [adds a to-do through the api](../../apps/web/e2e/todos.spec.ts)`,
    );
    expect(conflictsOf(text)).toEqual([]);
  });

  it('reads a proof whose spec link has a line anchor', () => {
    const text = prd(
      '- **Adds a to-do.** The page shows the to-do.',
      proof('adds a to-do through the api', '../../apps/web/e2e/todos.spec.ts#L12'),
    );
    expect(conflictsOf(text)).toEqual([]);
  });

  it.each([
    ['a numbered behaviour', '1. **Adds twice.** Again.'],
    ['a plus-marked behaviour', '+ **Adds twice.** Again.'],
    ['a behaviour indented by one space', ' - **Adds twice.** Again.'],
    [
      'a proof indented by one space',
      ' - Proved by [adds twice](../../apps/web/e2e/todos.spec.ts)',
    ],
    [
      'a proof link with a title',
      '  - Proved by [adds twice](../../apps/web/e2e/todos.spec.ts "title")',
    ],
    [
      'a proof link in angle brackets',
      '  - Proved by [adds twice](<../../apps/web/e2e/todos.spec.ts>)',
    ],
    ['a proof with no list marker', '  Proved by [adds twice](../../apps/web/e2e/todos.spec.ts)'],
  ])('fails, naming the line, on %s the check cannot read', (_, line) => {
    const text = prd(
      '- **Adds a to-do.** The page shows the to-do.',
      proof('adds a to-do through the api'),
      line,
    );
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/todos\.md:11 .*cannot read/),
    ]);
  });

  it('names the unread lines of a PRD whose behaviours it cannot read at all', () => {
    const text = prd('1. **Adds.** Hi.', proof('adds a to-do through the api'));
    expect(conflictsOf(text)).toEqual([
      expect.stringContaining('lists no behaviours'),
      expect.stringMatching(/^docs\/prd\/todos\.md:9 .*cannot read/),
      expect.stringMatching(/^docs\/prd\/todos\.md:10 .*cannot read/),
    ]);
  });

  it('fails on a proof that comes before any behaviour', () => {
    const text = prd(
      proof('adds a to-do through the api'),
      '- **Adds a to-do.** The page shows the to-do.',
      proof('adds a to-do through the api'),
    );
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/todos\.md:9 .*cannot read/),
    ]);
  });

  it('fails when a PRD has a second Behaviours section', () => {
    const text = prd(
      '- **Adds a to-do.** The page shows the to-do.',
      proof('adds a to-do through the api'),
      '',
      '## Behaviours',
      '',
      '- **Adds twice.** Again.',
    );
    expect(conflictsOf(text)).toEqual([
      expect.stringMatching(/^docs\/prd\/todos\.md:12 .*second `## Behaviours`/),
    ]);
  });

  it('checks every PRD and reports the one that conflicts', () => {
    const second = prd('- **Adds twice.** Again.', proof('adds twice'));
    expect(
      conflictsOf(prd('- **Adds.** Hi.', proof('adds a to-do through the api')), {
        'docs/prd/repeat.md': second,
      }),
    ).toEqual([expect.stringMatching(/^docs\/prd\/repeat\.md:10 .*"adds twice"/)]);
  });

  it('treats every tracked Markdown file directly in docs/prd/ as a PRD, a README included', () => {
    const conflicts = conflictsOf(prd('- **Adds.** Hi.', proof('adds a to-do through the api')), {
      'docs/prd/README.md': '# PRDs\n\n- [To-dos](todos.md)\n',
    });
    expect(conflicts).toEqual([
      expect.stringMatching(/^docs\/prd\/README\.md lists no behaviours/),
      expect.stringMatching(/^docs\/prd\/README\.md has no `Covers` line/),
    ]);
  });
});

describe('PRD coverage', () => {
  const text = prd('- **Adds.** Hi.', proof('adds a to-do through the api'));

  it('requires a Covers line even when a behaviour already links its spec', () => {
    expect(conflictsOf(text.replace(COVERS, ''))).toEqual([
      expect.stringMatching(/^docs\/prd\/todos\.md has no `Covers` line/),
    ]);
  });

  it('accepts multiple globs, including brace alternatives and zero nested folders', () => {
    const declaration =
      '- **Covers:** `apps/{web,api}/src/**`, `apps/web/src/routes/todos/**/TodosPage.tsx`';
    expect(conflictsOf(text.replace(COVERS, declaration))).toEqual([]);
  });

  it('leaves ordinary prose beginning with Covers outside the declaration parser', () => {
    expect(
      conflictsOf(text.replace('Keeps a to-do list.', 'Covers the visitor’s to-do needs.')),
    ).toEqual([]);
  });

  it('reports an unmatched glob even when another glob matches a tracked file', () => {
    const declaration = `${COVERS}, \`apps/web/src/routes/missing/**\``;
    expect(conflictsOf(text.replace(COVERS, declaration))).toEqual([
      expect.stringMatching(
        /^docs\/prd\/todos\.md .*apps\/web\/src\/routes\/missing\/\*\*.*matches no tracked file/,
      ),
    ]);
  });

  it.each([
    ['an empty declaration', '- **Covers:**'],
    ['an empty code span', '- **Covers:** ``'],
    ['an unquoted path', '- **Covers:** apps/web/src/routes/todos/**'],
    ['an unclosed code span', '- **Covers:** `apps/web/src/routes/todos/**'],
    ['trailing prose', `${COVERS} and its tests`],
    ['a trailing comma', `${COVERS},`],
    ['a missing comma', `${COVERS} \`${SPEC}\``],
    ['an unquoted second path', `${COVERS}, ${SPEC}`],
    ['a different list marker', COVERS.replace('- ', '+ ')],
    ['a non-bold label', COVERS.replace('**Covers:**', 'Covers:')],
    ['an underscore-bold label', COVERS.replace('**Covers:**', '__Covers:__')],
    ['an absolute path', '- **Covers:** `/apps/web/src/routes/todos/**`'],
    ['a Windows absolute path', '- **Covers:** `C:/apps/web/src/routes/todos/**`'],
    ['a parent traversal', '- **Covers:** `../apps/web/src/routes/todos/**`'],
    ['an embedded parent traversal', '- **Covers:** `apps/web/../web/src/routes/todos/**`'],
    ['a backslash path', '- **Covers:** `apps\\web\\src\\routes\\todos\\**`'],
  ])('rejects %s as an unreadable Covers line', (_, declaration) => {
    const conflicts = conflictsOf(text.replace(COVERS, declaration));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatch(/^docs\/prd\/todos\.md:2 /);
    expect(conflicts[0]).toContain('Covers');
    expect(conflicts[0]).toContain('cannot read');
  });

  it.each([
    COVERS,
    COVERS.replace('**Covers:**', '__Covers:__'),
  ])('rejects a second Covers line instead of silently picking one: %s', (declaration) => {
    expect(conflictsOf(text.replace(COVERS, `${COVERS}\n${declaration}`))).toEqual([
      expect.stringMatching(/^docs\/prd\/todos\.md:3 .*second `Covers` line/),
    ]);
  });

  it('requires Covers to be in the header before the first section', () => {
    const misplaced = text.replace(`${COVERS}\n## Intent`, `\n## Intent\n${COVERS}`);
    const conflicts = conflictsOf(misplaced);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatch(/^docs\/prd\/todos\.md:4 /);
    expect(conflicts[0]).toContain('header');
  });

  it('preserves declared globs and automatically covers linked specs once, without anchors', () => {
    const declaration = `${COVERS}, \`${SPEC}\``;
    const parsed = parseBehaviours(
      'docs/prd/todos.md',
      prd(
        '- **Adds.** Hi.',
        proof('adds a to-do through the api', `../../${SPEC}#L12`),
        proof('says so when the api fails'),
        proof('works accessibly', '../../apps/web/e2e/accessibility.spec.ts#L30'),
      ).replace(COVERS, declaration),
    );
    expect(parsed.covers).toEqual(['apps/web/src/routes/todos/**', SPEC]);
    expect(parsed.coverageConflicts).toEqual([]);
    expect(coveredPaths(parsed)).toEqual([
      'apps/web/src/routes/todos/**',
      SPEC,
      'apps/web/e2e/accessibility.spec.ts',
    ]);
  });
});

describe('createNodeFilesystem', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'prd-check-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function track(files: Record<string, string>) {
    Object.entries(files).forEach(([path, content]) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    });
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
  }

  it('reports a tracked spec deleted from the working tree as missing, not a crash', () => {
    track({
      'docs/prd/todos.md': prd('- **Adds.** Hi.', proof('adds a to-do through the api')),
      [SPEC]: SPEC_TEXT,
      [SOURCE]: '',
    });
    rmSync(join(root, SPEC));
    expect(findPrdConflicts(createNodeFilesystem(root))).toEqual([
      expect.stringContaining('is not a tracked E2E spec'),
    ]);
  });

  it('ignores untracked files when checking whether a Covers glob matches', () => {
    track({
      'docs/prd/todos.md': prd('- **Adds.** Hi.', proof('adds a to-do through the api')),
      [SPEC]: SPEC_TEXT,
    });
    mkdirSync(dirname(join(root, SOURCE)), { recursive: true });
    writeFileSync(join(root, SOURCE), '');
    expect(findPrdConflicts(createNodeFilesystem(root))).toEqual([
      expect.stringContaining('matches no tracked file'),
    ]);
  });
});
