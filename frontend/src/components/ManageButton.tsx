'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { defaultLocale, locales } from '@/i18n/routing';
import { ApiClientError, createPortalSession } from '@/lib/api';
import { ErrorMessage } from './ErrorMessage';
import { Button } from './ui';

interface ManageButtonProps {
  variant?: 'compact' | 'primary';
  className?: string;
}

export function ManageButton({ variant = 'primary', className }: ManageButtonProps) {
  const t = useTranslations('subscription');
  const errors = useTranslations('errors');
  const activeLocale = useLocale();
  const locale = locales.find((candidate) => candidate === activeLocale) ?? defaultLocale;
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<'network' | 'generic' | null>(null);

  async function openPortal() {
    setPending(true);
    setErrorKey(null);
    try {
      const session = await createPortalSession(locale);
      window.location.assign(session.url);
    } catch (error) {
      setErrorKey(error instanceof ApiClientError && error.code === 'NETWORK_ERROR' ? 'network' : 'generic');
      setPending(false);
    }
  }

  return (
    <div className={className}>
      <Button
        variant={variant === 'compact' ? 'secondary' : 'primary'}
        size={variant === 'compact' ? 'sm' : 'md'}
        loading={pending}
        onClick={() => {
          void openPortal();
        }}
      >
        {pending ? t('opening') : t('manage')}
      </Button>
      {errorKey === null ? null : (
        <ErrorMessage
          className="mt-2 text-left"
          message={errors(errorKey)}
          onRetry={() => {
            void openPortal();
          }}
        />
      )}
    </div>
  );
}
