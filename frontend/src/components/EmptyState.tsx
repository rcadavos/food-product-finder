import type { ReactNode } from 'react';
import { Card } from './ui';

interface EmptyStateProps {
  title: string;
  body?: string;
  children?: ReactNode;
}

export function EmptyState({ title, body, children }: EmptyStateProps) {
  return (
    <Card
      padding="none"
      className="border-dashed border-brand-200 bg-white/70 px-6 py-14 text-center shadow-none backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/50"
    >
      <span
        aria-hidden="true"
        className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-800/40 dark:text-brand-300"
      >
        <svg viewBox="0 0 24 24" className="size-6 fill-current">
          <path d="M10.5 3a7.5 7.5 0 1 1-4.9 13.2l-3.1 3.1a1 1 0 0 1-1.4-1.4l3.1-3.1A7.5 7.5 0 0 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" />
        </svg>
      </span>
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
      {body ? (
        <p className="mx-auto mt-2 max-w-prose text-sm text-neutral-500 dark:text-neutral-400">{body}</p>
      ) : null}
      {children ? <div className="mt-5 flex flex-wrap justify-center gap-3">{children}</div> : null}
    </Card>
  );
}
