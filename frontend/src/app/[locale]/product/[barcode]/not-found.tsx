import { useTranslations } from 'next-intl';
import { ButtonLink, Card, Container } from '@/components/ui';

export default function ProductNotFound() {
  const t = useTranslations('product');

  return (
    <Container className="py-16">
      <Card className="mx-auto max-w-2xl text-center">
        <p aria-hidden="true" className="text-5xl font-bold text-brand-600">
          404
        </p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{t('notFoundTitle')}</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{t('notFoundBody')}</p>
        <ButtonLink href="/" className="mt-6">
          {t('backToSearch')}
        </ButtonLink>
      </Card>
    </Container>
  );
}
