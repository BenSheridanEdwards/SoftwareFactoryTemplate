import { normaliseTitle, TITLE_MAX_LENGTH, TITLE_MESSAGES } from './rules.ts';

it.each([
  ['  Buy   milk  ', 'Buy milk'],
  ['Buy\tmilk', 'Buy milk'],
  ['Buy\n\nmilk', 'Buy milk'],
  ['\u00a0Buy\u00a0\u00a0milk\u00a0', 'Buy milk'],
])('normalises %j to %j', (title, normalised) => {
  expect(normaliseTitle(title)).toBe(normalised);
});

it('says how long a title may be in the message for a long one', () => {
  expect(TITLE_MESSAGES.tooLong).toBe(`Use ${TITLE_MAX_LENGTH} characters or fewer`);
});
