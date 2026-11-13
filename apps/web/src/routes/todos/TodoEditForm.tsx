import { Button, TextField } from '@repo/ui';
import { useTodoForm } from './useTodoForm';
import type { Todo } from './useTodos';

export interface TodoEditFormProps {
  readonly todo: Todo;
  readonly busy: boolean;
  readonly onSave: (id: Todo['id'], title: Todo['title']) => void;
  readonly onCancel: () => void;
}

export function TodoEditForm({ todo, busy, onSave, onCancel }: TodoEditFormProps) {
  const { register, handleSubmit, formState } = useTodoForm(todo.title);
  const handleSave = handleSubmit(({ title }) => onSave(todo.id, title));

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSave} noValidate>
      <TextField
        label="New title"
        autoComplete="off"
        error={formState.errors.title?.message}
        {...register('title')}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Save
        </Button>
        <Button disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
