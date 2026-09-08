import { cn } from './cn';

export interface SkeletonProps {
  className?: string;
}

/** A shape, not content: hidden from the accessibility tree and still under reduced motion. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block animate-pulse rounded-md bg-neutral-200 motion-reduce:animate-none dark:bg-neutral-800',
        className,
      )}
    />
  );
}
