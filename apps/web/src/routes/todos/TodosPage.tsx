import { TodoForm } from './TodoForm';
export function TodosPage() {
  return (
    <TodoForm
      busy={false}
      onAdd={() => {
        throw new Error('Pending implementation');
      }}
    />
  );
}
