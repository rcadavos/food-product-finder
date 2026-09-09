import { useTranslations } from 'next-intl';
import { Alert, Button } from './ui';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

/** Errors are announced, iconed and worded — the red is decoration, never the message. */
export function ErrorMessage({ message, onRetry, className }: ErrorMessageProps) {
  const t = useTranslations('errors');

  return (
    <Alert
      tone="error"
      className={className}
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t('retry')}
          </Button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  );
}
