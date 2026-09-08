import type { InputHTMLAttributes, Ref } from 'react';
import { cn } from './cn';

const BASE_CLASSES =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500';

export const INPUT_BORDER_CLASSES = 'border-neutral-300 dark:border-neutral-700';
export const INPUT_INVALID_BORDER_CLASSES = 'border-red-500 dark:border-red-500';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ invalid = false, className, type, ...rest }: InputProps) {
  return (
    <input
      type={type ?? 'text'}
      className={cn(
        BASE_CLASSES,
        invalid ? INPUT_INVALID_BORDER_CLASSES : INPUT_BORDER_CLASSES,
        className,
      )}
      {...rest}
    />
  );
}
