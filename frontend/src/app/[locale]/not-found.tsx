import { useTranslations } from 'next-intl';
import { ButtonLink, Card, Container } from '@/components/ui';

export default function LocaleNotFound() {
  const t = useTranslations();

  return (
    <Container className="py-16">
      <Card className="mx-auto max-w-2xl text-center">
        <p aria-hidden="true" className="text-5xl font-bold text-brand-600">
          404
        </p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{t('errors.notFound')}</h1>
        <ButtonLink href="/" className="mt-6">
          {t('product.backToSearch')}
        </ButtonLink>
      </Card>
    </Container>
  );
}
