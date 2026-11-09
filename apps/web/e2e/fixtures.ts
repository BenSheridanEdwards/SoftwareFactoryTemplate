import { test as base, type ConsoleMessage, expect, type WebError } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

interface ConsoleFixtures {
  expectedConsole: RegExp[];
  expectConsole: (pattern: RegExp) => void;
}

type RunnerMethod = 'warn' | 'error';

const RUNNER_METHODS: RunnerMethod[] = ['warn', 'error'];

export const test = base.extend<ConsoleFixtures>({
  expectedConsole: [[], { option: true }],
  expectConsole: [
    async ({ context, expectedConsole }, use) => {
      const messages: string[] = [];
      const expected = [...expectedConsole];
      // The context hears every page, popup and dedicated worker the test opens.
      const recordConsole = (message: ConsoleMessage) => {
        if (message.type() === 'warning' || message.type() === 'error') {
          messages.push(`console.${message.type()}: ${message.text()}`);
        }
      };
      const recordError = (error: WebError) => {
        messages.push(`pageerror: ${error.error().message}`);
      };
      // The test's own Node process: spec code, Playwright and Node warnings.
      const originals = RUNNER_METHODS.map((method) => [method, console[method]] as const);
      const recordWarning = (warning: Error) => {
        messages.push(`runner warning: ${warning.message}`);
      };
      context.on('console', recordConsole);
      context.on('weberror', recordError);
      process.on('warning', recordWarning);
      originals.forEach(([method, original]) => {
        console[method] = (...args: unknown[]) => {
          messages.push(`runner console.${method}: ${args.map(String).join(' ')}`);
          original(...args);
        };
      });
      await use((pattern) => {
        expected.push(pattern);
      });
      await new Promise((resolve) => setImmediate(resolve));
      originals.forEach(([method, original]) => {
        console[method] = original;
      });
      process.off('warning', recordWarning);
      context.off('console', recordConsole);
      context.off('weberror', recordError);
      expect({
        unexpected: messages.filter(
          (message) => !expected.some((pattern) => message.search(pattern) !== -1),
        ),
        missing: expected
          .filter((pattern) => !messages.some((message) => message.search(pattern) !== -1))
          .map(String),
      }).toEqual({ unexpected: [], missing: [] });
    },
    { auto: true },
  ],
});

/** The value a step expects to be there; a missing one fails the test where it is read. */
export function present<Value>(value: Value | null | undefined): Value {
  if (value === undefined || value === null) {
    throw new Error(`Expected a value, received ${value}`);
  }
  return value;
}

/** The value of a success; a failure fails the test where the value is read. */
export function unwrap<Value>(outcome: { ok: true; value: Value } | { ok: false }): Value {
  if (!outcome.ok) {
    throw new Error(`Expected a success, received ${JSON.stringify(outcome)}`);
  }
  return outcome.value;
}
