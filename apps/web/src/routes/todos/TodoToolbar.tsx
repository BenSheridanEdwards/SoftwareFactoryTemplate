import { Button } from '@repo/ui';
import { TODO_FILTERS, type TodoFilter } from './todoFilter';

export interface TodoToolbarProps {
  readonly filter: TodoFilter;
  readonly canClearDone: boolean;
  readonly onFilter: (filter: TodoFilter) => void;
  readonly onClearDone: () => void;
}

export function TodoToolbar({ filter, canClearDone, onFilter, onClearDone }: TodoToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <fieldset aria-label="Filter" className="flex gap-2">
        {TODO_FILTERS.map(({ value, label }) => (
          <Button
            key={value}
            aria-pressed={filter === value}
            className="aria-pressed:border-focus aria-pressed:text-focus"
            onClick={() => onFilter(value)}
          >
            {label}
          </Button>
        ))}
      </fieldset>
      <Button disabled={!canClearDone} onClick={onClearDone}>
        Clear done
      </Button>
    </div>
  );
}
