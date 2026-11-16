/** The longest valid title, counted after normalising. */
export const TITLE_MAX_LENGTH = 100;

/** What the api and the page say about an invalid title. */
export const TITLE_MESSAGES = {
  blank: 'Enter a title',
  tooLong: `Use ${TITLE_MAX_LENGTH} characters or fewer`,
} as const;

/** Trims both ends and turns each run of whitespace inside into one space. */
export function normaliseTitle(title: string): string {
  return title.trim().replace(/\s+/gu, ' ');
}
