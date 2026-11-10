import { type ComponentProps, useId } from 'react';
import { cn } from './cn';

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  readonly label: string;
  readonly error?: string | undefined;
}

const INPUT_CLASSES = cn(
  'rounded-lg border border-line bg-canvas px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger',
);

export function TextField({
  label,
  error,
  className,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...inputProps
}: TextFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const describedIds = [describedBy, errorId].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold" htmlFor={inputId}>
        {label}
      </label>
      <input
        {...inputProps}
        id={inputId}
        className={cn(INPUT_CLASSES, className)}
        aria-invalid={error ? true : invalid}
        aria-describedby={error ? describedIds : describedBy}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
