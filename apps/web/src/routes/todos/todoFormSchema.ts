import { normaliseTitle, TITLE_MAX_LENGTH, TITLE_MESSAGES } from '@repo/api/todos/rules';
import { Schema, SchemaTransformation } from 'effect';

/** The api's title rules, from its rules module: normalise, then 1 to 100 characters. */
export const todoFormSchema = Schema.Struct({
  title: Schema.String.pipe(
    Schema.decodeTo(
      Schema.String,
      SchemaTransformation.transform({ decode: normaliseTitle, encode: (title) => title }),
    ),
  ).check(
    Schema.isNonEmpty({ message: TITLE_MESSAGES.blank }),
    Schema.isMaxLength(TITLE_MAX_LENGTH, { message: TITLE_MESSAGES.tooLong }),
  ),
});
