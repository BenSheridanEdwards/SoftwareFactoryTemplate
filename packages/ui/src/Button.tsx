import type { ComponentProps } from 'react';
import { cn } from './cn';

export type ButtonProps = ComponentProps<'button'>;

const BUTTON_CLASSES = cn(
  'cursor-pointer rounded-lg border border-line bg-raised px-4 py-2 text-base font-semibold text-ink transition-colors hover:border-line-strong hover:bg-raised-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50',
);

export function Button({ className, ...props }: ButtonProps) {
  return <button type="button" {...props} className={cn(BUTTON_CLASSES, className)} />;
}
