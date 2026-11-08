import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import {
  addTodo,
  clearDoneTodos,
  deleteTodo,
  listTodos,
  renameTodo,
  setTodoDone,
} from './application.ts';

const addInputSchema = Schema.Struct({ title: Schema.String });
const setDoneInputSchema = Schema.Struct({ id: Schema.String, done: Schema.Boolean });
const renameInputSchema = Schema.Struct({ id: Schema.String, title: Schema.String });
const deleteInputSchema = Schema.Struct({ id: Schema.String });

const ERROR_CODES = { 'invalid-title': 'BAD_REQUEST', 'not-found': 'NOT_FOUND' } as const;

type Outcome<Value> =
  | { readonly ok: true; readonly value: Value }
  | {
      readonly ok: false;
      readonly problem: { readonly kind: keyof typeof ERROR_CODES; readonly message: string };
    };

/** The value of a successful outcome, or the tRPC error its problem maps to. */
function answer<Value>(outcome: Outcome<Value>): Value {
  if (!outcome.ok) {
    throw new TRPCError({
      code: ERROR_CODES[outcome.problem.kind],
      message: outcome.problem.message,
    });
  }
  return outcome.value;
}

const todosProcedures = {
  list: procedure.query(() => listTodos()),
  add: procedure
    .input(Schema.toStandardSchemaV1(addInputSchema))
    .mutation(({ input }) => answer(addTodo(input))),
  setDone: procedure
    .input(Schema.toStandardSchemaV1(setDoneInputSchema))
    .mutation(({ input }) => answer(setTodoDone(input))),
  rename: procedure
    .input(Schema.toStandardSchemaV1(renameInputSchema))
    .mutation(({ input }) => answer(renameTodo(input))),
  delete: procedure
    .input(Schema.toStandardSchemaV1(deleteInputSchema))
    .mutation(({ input }) => answer(deleteTodo(input))),
  clearDone: procedure.mutation(() => clearDoneTodos()),
};

export const todosRouter: ReturnType<typeof router<typeof todosProcedures>> =
  router(todosProcedures);
