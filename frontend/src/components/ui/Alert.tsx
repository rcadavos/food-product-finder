import type { ReactNode } from 'react';
import { cn } from './cn';

export type AlertTone = 'error' | 'warning' | 'info' | 'success';

const TONE_CLASSES: Record<AlertTone, string> = {
  error: 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100',
  warning:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100',
  info: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100',
  success:
    'border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-800/30 dark:text-brand-100',
};

/** An icon per tone, so the colour is never the only thing carrying the message. */
const TONE_ICON_PATHS: Record<AlertTone, string> = {
  error:
    'M10 1.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8Zm0 3.6a1 1 0 0 1 1 1.06l-.26 4.2a.75.75 0 0 1-1.49 0l-.25-4.2A1 1 0 0 1 10 5.2Zm0 8.1a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z',
  warning:
    'M9.13 2.6a1 1 0 0 1 1.74 0l7.1 12.7a1 1 0 0 1-.87 1.49H2.9a1 1 0 0 1-.87-1.49L9.13 2.6Zm.87 3.9a1 1 0 0 0-1 1.06l.25 4a.75.75 0 0 0 1.5 0l.25-4a1 1 0 0 0-1-1.06Zm0 7.4a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z',
  info: 'M10 1.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8Zm0 2.6a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Zm1 10.9a1 1 0 0 1-2 0V8.9a1 1 0 0 1 2 0v6.2Z',
  success:
    'M10 1.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8Zm4.06 5.83-4.9 5.9a1 1 0 0 1-1.48.06L5.5 11.2a1 1 0 1 1 1.4-1.42l1.4 1.4 4.22-5.07a1 1 0 1 1 1.54 1.28Z',
};

/** Only a genuine problem interrupts a screen reader; the calmer tones just update. */
const TONE_ROLES: Record<AlertTone, 'alert' | 'status'> = {
  error: 'alert',
  warning: 'alert',
  info: 'status',
  success: 'status',
};

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Alert({ tone = 'error', title, children, action, className }: AlertProps) {
  return (
    <div
      role={TONE_ROLES[tone]}
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-lg border p-3 text-sm',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 fill-current">
        <path d={TONE_ICON_PATHS[tone]} />
      </svg>
      <div className="min-w-0 flex-1">
        {title === undefined ? null : <p className="font-semibold">{title}</p>}
        {children === undefined ? null : <div className={title === undefined ? undefined : 'mt-1'}>{children}</div>}
      </div>
      {action === undefined ? null : action}
    </div>
  );
}
