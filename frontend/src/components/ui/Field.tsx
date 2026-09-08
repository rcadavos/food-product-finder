'use client';

import { useId, type ReactNode } from 'react';
import { cn } from './cn';
import { VisuallyHidden } from './VisuallyHidden';

export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': boolean | undefined;
  required: boolean | undefined;
}

export interface FieldProps {
  label: string;
  /** Keeps the label in the accessibility tree while the design relies on a placeholder. */
  labelHidden?: boolean;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (controlProps: FieldControlProps) => ReactNode;
}

/**
 * Owns the label/hint/error wiring so no caller hand-builds ids or forgets an
 * `aria-describedby`. Client-only because `useId` is a hook.
 */
export function Field({
  label,
  labelHidden = false,
  hint,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = cn(
    hint === undefined ? undefined : hintId,
    error === undefined ? undefined : errorId,
  );

  const controlProps: FieldControlProps = {
    id,
    'aria-describedby': describedBy.length > 0 ? describedBy : undefined,
    'aria-invalid': error === undefined ? undefined : true,
    required: required ? true : undefined,
  };

  const labelNode = (
    <label htmlFor={id} className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
      {label}
    </label>
  );

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {labelHidden ? <VisuallyHidden>{labelNode}</VisuallyHidden> : labelNode}
      {children(controlProps)}
      {hint === undefined ? null : (
        <p id={hintId} className="text-xs text-neutral-500 dark:text-neutral-400">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
