#!/usr/bin/env node
/**
 * Fail when a Fallow rule or rule-pack rule is set to `warn`. Fallow reports a
 * warn-level finding and still exits 0, so `pnpm arch:gate` runs this first and
 * a Fallow warning fails the gate (ADR 0127).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FALLOW = fileURLToPath(new URL('../node_modules/.bin/fallow', import.meta.url));
const WARN_SEVERITY = /"severity"\s*:\s*"warn"/;

/** Each rule, or rule-pack file, that `directory`'s resolved Fallow config sets to `warn`. */
export function fallowWarnings(directory) {
  const config = JSON.parse(
    execFileSync(FALLOW, ['config', '--format', 'json', '-q'], {
      cwd: directory,
      encoding: 'utf8',
    }),
  );
  const ruleSets = [
    config.rules ?? {},
    ...(config.overrides ?? []).map(({ rules }) => rules ?? {}),
  ];

  return [
    ...ruleSets.flatMap((rules) =>
      Object.entries(rules)
        .filter(([, severity]) => severity === 'warn')
        .map(([rule]) => `rule ${rule}`),
    ),
    ...(config.rulePacks ?? [])
      .filter((pack) => WARN_SEVERITY.test(readFileSync(join(directory, pack), 'utf8')))
      .map((pack) => `rule pack ${pack}`),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const warnings = fallowWarnings(process.cwd());

  if (warnings.length > 0) {
    console.error(
      `Fallow reports a warning and still passes, so set each of these to "error" or "off":\n${warnings
        .map((warning) => `  - ${warning}`)
        .join('\n')}`,
    );
    process.exit(1);
  }

  console.log('OK: every Fallow rule is an error or off.');
}
