import { useTranslations } from 'next-intl';
import { SubscribeButton } from '@/components';
import { ButtonLink, Card, Container } from '@/components/ui';

export default function BillingCancelPage() {
  const t = useTranslations('subscription');

  return (
    <Container className="py-12">
      <Card className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight">{t('cancelTitle')}</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{t('cancelBody')}</p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <SubscribeButton variant="primary" />
          <ButtonLink href="/" variant="secondary">
            {t('continueToSearch')}
          </ButtonLink>
        </div>

        <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">{t('priceNote')}</p>
      </Card>
    </Container>
  );
}
