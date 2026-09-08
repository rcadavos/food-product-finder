'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { usePathname } from '@/i18n/navigation';
import { defaultLocale, locales } from '@/i18n/routing';
import { ApiClientError, createCheckoutSession } from '@/lib/api';
import { ErrorMessage } from './ErrorMessage';
import { Button } from './ui';

interface SubscribeButtonProps {
  variant?: 'compact' | 'primary';
  /** Overrides the default "Subscribe" wording without duplicating the checkout logic. */
  label?: string;
  className?: string;
}

export function SubscribeButton({ variant = 'primary', label, className }: SubscribeButtonProps) {
  const t = useTranslations('subscription');
  const errors = useTranslations('errors');
  const activeLocale = useLocale();
  const locale = locales.find((candidate) => candidate === activeLocale) ?? defaultLocale;
  // Locale-less, so the backend can re-prefix it with whatever locale checkout ran in.
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<'network' | 'generic' | null>(null);

  async function startCheckout() {
    setPending(true);
    setErrorKey(null);
    try {
      const session = await createCheckoutSession(locale, pathname);
      // Checkout is hosted by Stripe, so we hand the tab over instead of routing internally.
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
          void startCheckout();
        }}
      >
        {pending ? t('subscribing') : (label ?? t('subscribe'))}
      </Button>
      {errorKey === null ? null : (
        <ErrorMessage
          className="mt-2 text-left"
          message={errors(errorKey)}
          onRetry={() => {
            void startCheckout();
          }}
        />
      )}
    </div>
  );
}
