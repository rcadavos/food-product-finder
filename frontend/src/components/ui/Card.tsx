import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type CardElement = 'div' | 'section' | 'article' | 'li';
export type CardPadding = 'none' | 'sm' | 'md';

/** The one surface every panel, card and table in the app sits on. */
const SURFACE_CLASSES =
  'rounded-[var(--radius-card)] border border-black/5 bg-white shadow-card dark:border-white/10 dark:bg-neutral-900';

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: CardElement;
  padding?: CardPadding;
}

export function Card({ as: Component = 'div', padding = 'md', className, children, ...rest }: CardProps) {
  return (
    <Component className={cn(SURFACE_CLASSES, PADDING_CLASSES[padding], className)} {...rest}>
      {children}
    </Component>
  );
}
