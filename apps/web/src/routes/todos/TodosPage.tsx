import { TodoForm } from './TodoForm';
import { TodoList } from './TodoList';
import { useTodoEditing } from './useTodoEditing';
import { useTodos } from './useTodos';

export function TodosPage() {
  const todos = useTodos();
  const { list } = todos;
  const editing = useTodoEditing();

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
          <TodoList
            todos={list.todos}
            editingId={editing.editingId}
            busy={todos.busy}
            onToggle={todos.setTodoDone}
            onEdit={editing.startEditing}
            onDelete={todos.deleteTodo}
            onSave={(id, title) => todos.renameTodo(id, title, editing.stopEditing)}
            onCancel={editing.stopEditing}
          />
        ) : null}
      </div>
    </main>
  );
}
