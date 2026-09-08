import { cn } from './ui';

export interface BrandMarkProps {
  className?: string;
}

/**
 * The product mark: a magnifier whose lens holds a leaf — search, over food.
 *
 * Drawn with `currentColor` so it takes the colour of whatever it sits on, and
 * kept deliberately blunt (one ring, one handle, one solid leaf) because it also
 * has to survive being rendered 16 pixels wide in a browser tab. The same shapes
 * are reproduced in `src/app/icon.svg`, which is the favicon Next.js serves; keep
 * the two in step if this ever changes.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn('size-5', className)}>
      <circle cx="10" cy="10" r="6.6" stroke="currentColor" strokeWidth="2" />
      <path d="M14.9 15.1 20.2 20.4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M7.6 12.4c0-2.65 2.15-4.8 4.8-4.8 0 2.65-2.15 4.8-4.8 4.8Z" fill="currentColor" />
    </svg>
  );
}
