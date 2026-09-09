import type { HTMLAttributes, Ref } from 'react';
import { cn } from './cn';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  ref?: Ref<HTMLSpanElement>;
}

/**
 * The non-interactive twin of `Button variant="chip"`: same geometry, none of the hover
 * or focus affordances, because a tag is not a control.
 */
export function Chip({ className, children, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
