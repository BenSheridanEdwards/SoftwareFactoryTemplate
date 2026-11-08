import { present as presentInE2e } from '../../apps/web/e2e/fixtures';
import { testGlobals } from './test-globals';

const { present, unwrap } = testGlobals;

type Outcome = { ok: true; value: { id: string } } | { ok: false; problem: { message: string } };

describe.each([
  ['the Jest global', present],
  ['the E2E fixtures copy', presentInE2e],
])('present, as %s', (_name, check) => {
  it('returns a value that is there', () => {
    expect(check(['a'][0])).toBe('a');
    expect(check('')).toBe('');
    expect(check(0)).toBe(0);
    expect(check(false)).toBe(false);
  });

  it.each([undefined, null])('fails the test on %p', (value) => {
    expect(() => check(value)).toThrow(`Expected a value, received ${value}`);
  });

  it('returns an outcome as it is, without reading its value', () => {
    const outcome: Outcome = { ok: false, problem: { message: 'Enter a title' } };
    expect(check(outcome)).toBe(outcome);
  });
});

it('unwraps the value of a success', () => {
  const outcome: Outcome = { ok: true, value: { id: '1' } };
  expect(unwrap(outcome).id).toBe('1');
});

it('fails the test with the failure it received', () => {
  const outcome: Outcome = { ok: false, problem: { message: 'Enter a title' } };
  expect(() => unwrap(outcome)).toThrow(
    'Expected a success, received {"ok":false,"problem":{"message":"Enter a title"}}',
  );
});

it('makes present and unwrap globals in every Jest test', () => {
  expect(globalThis).toHaveProperty('present', present);
  expect(globalThis).toHaveProperty('unwrap', unwrap);
});
