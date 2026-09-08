import { useTranslations } from 'next-intl';
import { Card, Container, Skeleton, VisuallyHidden } from '@/components/ui';

export default function ProductLoading() {
  const t = useTranslations('common');

  return (
    <Container className="py-8 sm:py-10" role="status">
      <VisuallyHidden>{t('loading')}</VisuallyHidden>

      <Skeleton className="h-5 w-32 rounded" />

      <div className="mt-4 space-y-6" aria-hidden="true">
        <Card className="grid gap-6 sm:grid-cols-[minmax(0,18rem)_1fr]">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-3/4 rounded" />
            <Skeleton className="h-4 w-1/2 rounded" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <div className="grid gap-3 pt-4 sm:grid-cols-2">
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-full rounded" />
            </div>
          </div>
        </Card>

        <Card className="space-y-3">
          <Skeleton className="h-6 w-40 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-11/12 rounded" />
          <Skeleton className="h-4 w-2/3 rounded" />
        </Card>

        <Card className="space-y-3">
          <Skeleton className="h-6 w-48 rounded" />
          <Skeleton className="h-40 w-full rounded" />
        </Card>
      </div>
    </Container>
  );
}
