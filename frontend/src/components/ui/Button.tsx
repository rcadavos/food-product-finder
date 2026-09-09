import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from './cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'chip';
export type ButtonSize = 'sm' | 'md';

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600',
  secondary:
    'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 focus-visible:outline-brand-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800',
  ghost:
    'text-brand-700 hover:bg-brand-50 focus-visible:outline-brand-600 dark:text-brand-300 dark:hover:bg-neutral-800',
  chip: 'rounded-full border border-neutral-200 bg-white font-normal hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-brand-600 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

/** A chip reads as a tag rather than a control, so it sits tighter than the shared scale. */
const CHIP_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
};

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/**
 * Shared by `Button`, `ButtonLink` and the rare raw `<a>` that must look like a button
 * (the external Open Food Facts link), so the three can never drift apart.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: ButtonClassOptions = {}): string {
  return cn(
    BASE_CLASSES,
    VARIANT_CLASSES[variant],
    variant === 'chip' ? CHIP_SIZE_CLASSES[size] : SIZE_CLASSES[size],
    fullWidth && 'w-full',
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows the spinner, marks the control busy and blocks a second submit. */
  loading?: boolean;
  fullWidth?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant,
  size,
  loading = false,
  fullWidth,
  className,
  type,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      // Inside a <form> an untyped button submits; defaulting keeps that opt-in.
      type={type ?? 'button'}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {/* Children stay rendered while loading so the accessible name never disappears. */}
      {children}
    </button>
  );
}
