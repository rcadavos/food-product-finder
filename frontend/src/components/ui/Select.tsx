import type { Ref, SelectHTMLAttributes } from 'react';
import { cn } from './cn';
import { INPUT_BORDER_CLASSES, INPUT_INVALID_BORDER_CLASSES } from './Input';

const BASE_CLASSES =
  'cursor-pointer appearance-none rounded-lg border bg-white py-2 pl-3 pr-9 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-900 dark:text-neutral-100';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  /** Styles the positioning wrapper the decorative chevron is anchored to. */
  wrapperClassName?: string;
  ref?: Ref<HTMLSelectElement>;
}

/**
 * A styled **native** `<select>`, deliberately not a custom listbox: keyboard handling,
 * screen-reader semantics and the mobile picker all come for free and cannot regress.
 */
export function Select({ invalid = false, wrapperClassName, className, children, ...rest }: SelectProps) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        className={cn(
          BASE_CLASSES,
          invalid ? INPUT_INVALID_BORDER_CLASSES : INPUT_BORDER_CLASSES,
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 fill-neutral-500 dark:fill-neutral-400"
      >
        <path d="M10 13.5 4.5 7h11L10 13.5Z" />
      </svg>
    </div>
  );
}
