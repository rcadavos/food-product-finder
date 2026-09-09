import { cn } from './cn';
import { VisuallyHidden } from './VisuallyHidden';

export interface SpinnerProps {
  className?: string;
  /** Only for a spinner that stands alone; inside a Button the button's text is the name. */
  label?: string;
}

/**
 * Decorative by default: the ring is `aria-hidden`, so a busy button keeps announcing its
 * own label instead of gaining a second, competing one.
 */
export function Spinner({ className, label }: SpinnerProps) {
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className={cn('h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none', className)}
      >
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="opacity-25"
        />
        <path
          d="M18 10a8 8 0 0 0-8-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      {label === undefined ? null : <VisuallyHidden>{label}</VisuallyHidden>}
    </>
  );
}
