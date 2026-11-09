#!/usr/bin/env node
/**
 * Fail when a Fallow rule or rule-pack rule is set to `warn`, or duplication has
 * no threshold, which leaves each clone group a warning. Fallow reports a
 * warn-level finding and still exits 0, so `pnpm arch:gate` runs this first and
 * a Fallow warning fails the gate (ADR 0127).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FALLOW = fileURLToPath(new URL('../node_modules/.bin/fallow', import.meta.url));
const WARN_SEVERITY = /"severity"\s*:\s*"warn"/;

/** Each rule set to `warn`, in the rules and in each override. */
const ruleWarnings = (config) =>
  [config.rules, ...config.overrides.map(({ rules }) => rules ?? {})].flatMap((rules) =>
    Object.entries(rules)
      .filter(([, severity]) => severity === 'warn')
      .map(([rule]) => `rule ${rule}`),
  );

// The audit fails duplication over the threshold; in the changed files it reads, one clone group exceeds 0.001%.
const MAX_DUPLICATION_THRESHOLD = 0.001;

/** A duplication threshold of 0 or above 0.001, which leaves some clone groups as warnings. */
const duplicationWarnings = ({ duplicates }) =>
  duplicates.enabled &&
  !(duplicates.threshold > 0 && duplicates.threshold <= MAX_DUPLICATION_THRESHOLD)
    ? [
        `duplicates.threshold ${duplicates.threshold} (set it above 0 and at most ${MAX_DUPLICATION_THRESHOLD}, so each clone group fails)`,
      ]
    : [];

/** Each rule-pack file that sets a rule's severity to `warn`. */
const packWarnings = (config, directory) =>
  config.rulePacks
    .filter((pack) => WARN_SEVERITY.test(readFileSync(join(directory, pack), 'utf8')))
    .map((pack) => `rule pack ${pack}`);

/** Each setting in `directory`'s resolved Fallow config that leaves a finding at `warn`. */
export function fallowWarnings(directory) {
  const config = JSON.parse(
    execFileSync(FALLOW, ['config', '--format', 'json', '-q'], {
      cwd: directory,
      encoding: 'utf8',
    }),
  );

  return [
    ...ruleWarnings(config),
    ...duplicationWarnings(config),
    ...packWarnings(config, directory),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const warnings = fallowWarnings(process.cwd());

  if (warnings.length > 0) {
    console.error(
      `Fallow reports a warning and still passes, so set each rule to "error" or "off" and duplicates.threshold above 0 and at most 0.001:\n${warnings
        .map((warning) => `  - ${warning}`)
        .join('\n')}`,
    );
    process.exit(1);
  }

  console.log('OK: every Fallow finding is an error, or its rule is off.');
}
