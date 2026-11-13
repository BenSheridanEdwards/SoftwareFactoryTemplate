import { Button, TextField } from '@repo/ui';
import { useTodoForm } from './useTodoForm';

export interface TodoFormProps {
  readonly busy: boolean;
  readonly onAdd: (title: string, onAdded: () => void) => void;
}

export function TodoForm({ busy, onAdd }: TodoFormProps) {
  const { register, handleSubmit, formState, reset } = useTodoForm('');
  const handleAdd = handleSubmit(({ title }) => onAdd(title, () => reset()));

  return (
    <form className="flex flex-col gap-3" onSubmit={handleAdd} noValidate>
      <TextField
        label="Title"
        autoComplete="off"
        error={formState.errors.title?.message}
        {...register('title')}
      />
      <Button type="submit" disabled={busy}>
        Add
      </Button>
    </form>
  );
}
