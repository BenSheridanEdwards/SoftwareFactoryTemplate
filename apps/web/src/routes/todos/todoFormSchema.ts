import { Schema, SchemaTransformation } from 'effect';

const TITLE_MAX_LENGTH = 100;

/** The api's title rules: trim, collapse each whitespace run to one space, then 1 to 100 characters. */
export const todoFormSchema = Schema.Struct({
  title: Schema.String.pipe(
    Schema.decodeTo(
      Schema.String,
      SchemaTransformation.transform({
        decode: (title) => title.trim().replace(/\s+/gu, ' '),
        encode: (title) => title,
      }),
    ),
  ).check(
    Schema.isNonEmpty({ message: 'Enter a title' }),
    Schema.isMaxLength(TITLE_MAX_LENGTH, {
      message: `Use ${TITLE_MAX_LENGTH} characters or fewer`,
    }),
  ),
});
