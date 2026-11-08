import { TRPCError } from '@trpc/server';
import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { createTodoUseCases } from './application.ts';
import type { Outcome, TodoProblem } from './domain.ts';

const addInputSchema = Schema.Struct({ title: Schema.String });
const setDoneInputSchema = Schema.Struct({ id: Schema.String, done: Schema.Boolean });
const renameInputSchema = Schema.Struct({ id: Schema.String, title: Schema.String });
const deleteInputSchema = Schema.Struct({ id: Schema.String });

const ERROR_CODES = {
  'invalid-title': 'BAD_REQUEST',
  'not-found': 'NOT_FOUND',
} as const satisfies Record<TodoProblem['kind'], TRPCError['code']>;

/** The value of a successful outcome, or the tRPC error its problem maps to. */
function unwrapOrThrow<Value>(outcome: Outcome<Value>): Value {
  if (!outcome.ok) {
    throw new TRPCError({
      code: ERROR_CODES[outcome.problem.kind],
      message: outcome.problem.message,
    });
  }
  return outcome.value;
}

function todosProcedures() {
  const todos = createTodoUseCases();
  return {
    list: procedure.query(() => todos.listTodos()),
    add: procedure
      .input(Schema.toStandardSchemaV1(addInputSchema))
      .mutation(({ input }) => unwrapOrThrow(todos.addTodo(input))),
    setDone: procedure
      .input(Schema.toStandardSchemaV1(setDoneInputSchema))
      .mutation(({ input }) => unwrapOrThrow(todos.setTodoDone(input))),
    rename: procedure
      .input(Schema.toStandardSchemaV1(renameInputSchema))
      .mutation(({ input }) => unwrapOrThrow(todos.renameTodo(input))),
    delete: procedure
      .input(Schema.toStandardSchemaV1(deleteInputSchema))
      .mutation(({ input }) => unwrapOrThrow(todos.deleteTodo(input))),
    clearDone: procedure.mutation(() => todos.clearDoneTodos()),
  };
}

/** The to-do router over a new, empty to-do list. */
export function createTodosRouter(): ReturnType<typeof router<ReturnType<typeof todosProcedures>>> {
  return router(todosProcedures());
}
