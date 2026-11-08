import { TITLE_MAX_LENGTH, TITLE_MESSAGES } from '@repo/api/todos/rules';
import { Schema } from 'effect';
import { todoFormSchema } from './todoFormSchema';

const validate = (title: string) =>
  Schema.toStandardSchemaV1(todoFormSchema)['~standard'].validate({ title });

it.each([
  ['  Buy   milk  ', 'Buy milk'],
  ['Buy\tmilk', 'Buy milk'],
  ['\u00a0Buy\u00a0\u00a0milk', 'Buy milk'],
])('normalises %j to %j', (title, normalised) => {
  expect(validate(title)).toEqual({ value: { title: normalised } });
});

it('accepts 100 characters, counted after normalising', () => {
  expect(validate(` ${'a'.repeat(100)} `)).toEqual({ value: { title: 'a'.repeat(100) } });
  expect(validate(`${'b'.repeat(50)}   ${'b'.repeat(49)}`)).toEqual({
    value: { title: `${'b'.repeat(50)} ${'b'.repeat(49)}` },
  });
});

it.each([
  ['', 'Enter a title'],
  ['   ', 'Enter a title'],
  ['c'.repeat(101), 'Use 100 characters or fewer'],
])('rejects %j with %j', (title, message) => {
  expect(validate(title)).toEqual({ issues: [{ path: ['title'], message }] });
});

it('encodes a normalised title without changing it', () => {
  expect(Schema.encodeSync(todoFormSchema)({ title: 'Buy milk' })).toEqual({ title: 'Buy milk' });
});

it("checks the api's own limit and messages", () => {
  expect(validate('')).toEqual({ issues: [{ path: ['title'], message: TITLE_MESSAGES.blank }] });
  expect(validate('d'.repeat(TITLE_MAX_LENGTH + 1))).toEqual({
    issues: [{ path: ['title'], message: TITLE_MESSAGES.tooLong }],
  });
});
