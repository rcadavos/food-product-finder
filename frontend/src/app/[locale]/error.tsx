'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Alert, Button, Container } from '@/components/ui';
import { errorMessageKeyFor } from '@/lib/errorMessages';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LocaleError({ error, reset }: ErrorBoundaryProps) {
  const t = useTranslations();

  useEffect(() => {
    // The browser console is the only sink we have on the client; the server
    // side of a failed render is already logged by Next.
    console.error(error);
  }, [error]);

  return (
    <Container className="py-16">
      {/* A heading rather than the Alert's own title prop: this is the page's only h1. */}
      <Alert tone="warning" className="mx-auto max-w-2xl">
        <h1 className="text-xl font-bold tracking-tight">{t('errors.title')}</h1>
        <p className="mt-2">{t(errorMessageKeyFor(error))}</p>

        <Button onClick={reset} className="mt-5">
          {t('errors.retry')}
        </Button>

        {error.digest ? <p className="mt-4 font-mono text-xs opacity-80">{error.digest}</p> : null}
      </Alert>
    </Container>
  );
}
