import type { ReactNode } from 'react';

export interface VisuallyHiddenProps {
  children: ReactNode;
  as?: 'span' | 'div';
}

/** Text that only the accessibility tree reads. Replaces scattered `className="sr-only"`. */
export function VisuallyHidden({ children, as: Component = 'span' }: VisuallyHiddenProps) {
  return <Component className="sr-only">{children}</Component>;
}
