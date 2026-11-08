import { TodoForm } from './TodoForm';
import { TodoList } from './TodoList';
import { TodoToolbar } from './TodoToolbar';
import { filterTodos } from './todoFilter';
import { useTodoEditing } from './useTodoEditing';
import { useTodoFilter } from './useTodoFilter';
import { useTodos } from './useTodos';

export function TodosPage() {
  const todos = useTodos();
  const { filter, setFilter } = useTodoFilter();
  const { editingId, startEditing, stopEditing } = useTodoEditing();
  const { list } = todos;

  return (
    <main className="mx-auto max-w-160 px-4 py-6 sm:py-12">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">To-dos</h1>
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
        <TodoForm busy={todos.busy} onAdd={todos.addTodo} />
        {todos.failure ? (
          <p role="alert" className="text-danger">
            {todos.failure}
          </p>
        ) : null}
        {list.status === 'loading' ? <output>Loading to-dos…</output> : null}
        {list.status === 'failed' ? (
          <p role="alert" className="text-danger">
            Could not load the to-dos
          </p>
        ) : null}
        {list.status === 'loaded' ? (
          <>
            <TodoToolbar
              filter={filter}
              canClearDone={!todos.busy && list.todos.some((todo) => todo.done)}
              onFilter={setFilter}
              onClearDone={todos.clearDoneTodos}
            />
            <TodoList
              todos={filterTodos(list.todos, filter)}
              editingId={editingId}
              busy={todos.busy}
              onToggle={todos.setTodoDone}
              onEdit={startEditing}
              onDelete={todos.deleteTodo}
              onSave={(id, title) => todos.renameTodo(id, title, stopEditing)}
              onCancel={stopEditing}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}
