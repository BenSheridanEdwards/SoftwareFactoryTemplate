import { present } from './present';

type Outcome = { ok: true; value: { id: string } } | { ok: false; problem: { message: string } };

it('returns a value that is there', () => {
  expect(present(['a'][0])).toBe('a');
  expect(present('')).toBe('');
  expect(present(0)).toBe(0);
  expect(present(false)).toBe(false);
});

it.each([undefined, null])('fails the test on %p', (value) => {
  expect(() => present(value)).toThrow(`Expected a value, received ${value}`);
});

it('returns the value of an ok outcome', () => {
  const outcome: Outcome = { ok: true, value: { id: '1' } };
  expect(present(outcome).id).toBe('1');
});

it('fails the test on a failed outcome and names its problem', () => {
  const outcome: Outcome = { ok: false, problem: { message: 'Enter a title' } };
  expect(() => present(outcome)).toThrow(
    'Expected an ok outcome, received {"ok":false,"problem":{"message":"Enter a title"}}',
  );
});

it('is a global in every Jest test', () => {
  expect(globalThis).toHaveProperty('present', present);
});
