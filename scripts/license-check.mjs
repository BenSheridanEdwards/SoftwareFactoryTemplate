#!/usr/bin/env node
// License-compliance gate: fails when any dependency carries a license outside
// the permissive allow-list. Uses pnpm's built-in license listing over every
// workspace package (--recursive), so it adds no extra dependency and resolves
// the pnpm tree correctly.
// See .agents/project/TECH_STACK.md.
import { execSync } from 'node:child_process';

// SPDX identifiers we accept. All permissive. MPL-2.0 is weak (file-level)
// copyleft and is allowed for dependencies — e.g. axe-core, pulled in by the
// accessibility gate. Adding to this list is a deliberate, reviewable act.
const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'Apache-2.0',
  'BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'Python-2.0',
  'Unlicense',
  'BlueOak-1.0.0',
  'WTFPL',
  'Zlib',
  'MPL-2.0',
]);

const INNERMOST_GROUP = /\(([^()]*)\)/;
const PASSED = '<allowed>';
const FAILED = '<denied>';

// `A OR B` passes if either is allowed; `A AND B` binds tighter and needs both.
function allowsFlat(expression) {
  return expression.split(' OR ').some((alternative) =>
    alternative.split(' AND ').every((term) => {
      const licence = term.trim();
      return licence === PASSED || (licence !== FAILED && ALLOWED.has(licence));
    }),
  );
}

// Decide each innermost `(...)` group first, so `(A OR B) AND C` still needs C.
function decides(expression) {
  if (!INNERMOST_GROUP.test(expression)) return allowsFlat(expression);
  return decides(
    expression.replace(INNERMOST_GROUP, (_, group) => (allowsFlat(group) ? PASSED : FAILED)),
  );
}

// Handle SPDX expressions. Anything unrecognised fails closed, and so does a
// licence string that spells one of the group markers itself.
function isAllowed(expression) {
  return !expression.includes('<') && decides(expression);
}

let raw;
try {
  raw = execSync('pnpm --recursive licenses list --json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch (error) {
  console.error('license-check: could not run `pnpm --recursive licenses list` —', error.message);
  process.exit(1);
}

const byLicense = JSON.parse(raw);
const violations = Object.entries(byLicense)
  .filter(([license]) => !isAllowed(license))
  .map(([license, packages]) => {
    const list = Array.isArray(packages) ? packages : [];
    const names = list.map((pkg) => pkg.name ?? String(pkg)).slice(0, 12);
    return { license, count: list.length, names };
  });

if (violations.length > 0) {
  console.error('✗ License compliance: dependency license(s) outside the allow-list:\n');
  violations.forEach((violation) => {
    console.error(`  ${violation.license}  (${violation.count}): ${violation.names.join(', ')}`);
  });
  console.error(
    '\nReview the license, then either remove the dependency or add the SPDX id to' +
      '\nthe allow-list in scripts/license-check.mjs (a deliberate, reviewable change).',
  );
  process.exit(1);
}

const distinct = Object.keys(byLicense).length;
console.log(
  `✓ License compliance: every dependency is under the permissive allow-list (${distinct} distinct licenses).`,
);
