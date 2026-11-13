import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const WORKFLOWS = '.github/workflows';
const sparseLists = (text: string) =>
  [...text.matchAll(/^( *)sparse-checkout: *(?:\|\n((?:\1 {2,}\S.*\n?)+)|(\S.*))$/gm)].map(
    (match) =>
      present(match[2] ?? match[3])
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
  );
const localImports = (file: string) =>
  [
    ...readFileSync(file, 'utf8').matchAll(
      /^(?:import|export)(?!\s+type\b)(?:[\s\S]*?\bfrom)?\s*['"](\.{1,2}\/[^'"]+)['"]/gm,
    ),
  ].map((match) => normalize(join(dirname(file), present(match[1]))));
const closure = (file: string, seen: ReadonlySet<string> = new Set()): string[] =>
  seen.has(file)
    ? []
    : [
        file,
        ...localImports(file).flatMap((dependency) =>
          closure(dependency, new Set([...seen, file])),
        ),
      ];
const missing = (workflow: string, text: string) =>
  sparseLists(text).flatMap((list) =>
    list
      .filter((entry) => /\.(mjs|js|ts)$/.test(entry))
      .flatMap((entry) =>
        [...new Set(closure(entry))]
          .filter((dependency) => !list.includes(dependency))
          .map((dependency) => ({ workflow, from: entry, missing: dependency })),
      ),
  );
const workflowText = (name: string) => readFileSync(join(WORKFLOWS, name), 'utf8');

test('every module a workflow sparse-checks out has its local imports in the same list', () => {
  expect(
    readdirSync(WORKFLOWS)
      .filter((name) => name.endsWith('.yml'))
      .flatMap((name) => missing(name, workflowText(name))),
  ).toEqual([]);
});

test('the parser sees each sparse list', () => {
  expect(sparseLists(workflowText('confidence.yml')).map((list) => list.length)).toEqual([8]);
  expect(sparseLists(workflowText('enforcement-approval.yml')).map((list) => list.length)).toEqual([
    1,
  ]);
  expect(sparseLists(workflowText('update-behind-prs.yml')).map((list) => list.length)).toEqual([
    1,
  ]);
});

test("dropping an import's file from the list is detected", () => {
  const text = workflowText('confidence.yml').replace(
    /^ +scripts\/enforcement-approval.mjs\n/m,
    '',
  );
  expect(missing('confidence.yml', text)).toEqual(
    expect.arrayContaining(
      ['scripts/confidence-label.mjs', 'scripts/required-gates.mjs'].map((from) => ({
        workflow: 'confidence.yml',
        from,
        missing: 'scripts/enforcement-approval.mjs',
      })),
    ),
  );
});
