import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface InfoRowProps {
  label: string;
  value: ReactNode;
  missing?: boolean;
}

/** Renders only <dt>/<dd> so several rows can share one <dl> supplied by the page. */
export function InfoRow({ label, value, missing = false }: InfoRowProps) {
  const t = useTranslations('product');
  const isMissing = missing || value === null || value === undefined || value === '';

  return (
    <>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd
        className={
          isMissing
            ? 'mb-3 text-sm italic text-neutral-500 dark:text-neutral-400'
            : 'mb-3 text-sm font-medium text-neutral-900 dark:text-neutral-100'
        }
      >
        {isMissing ? t('notAvailable') : value}
      </dd>
    </>
  );
}
