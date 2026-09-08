import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type ContainerElement = 'div' | 'main' | 'section';

export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  as?: ContainerElement;
}

/** The single page gutter. Vertical rhythm stays with the caller. */
export function Container({ as: Component = 'div', className, children, ...rest }: ContainerProps) {
  return (
    <Component className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)} {...rest}>
      {children}
    </Component>
  );
}
