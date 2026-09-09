import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { ProductSummary } from '@/lib/types';
import { NutriScoreBadge } from './NutriScoreBadge';
import { Card, cn } from './ui';

export function ProductCard({ product }: { product: ProductSummary }) {
  const t = useTranslations('product');
  const name = product.name.value?.trim();
  const brands = product.brands.filter((brand) => brand.trim().length > 0);

  return (
    <Link
      href={`/product/${product.barcode}`}
      // The whole card is the target, so the link — not the surface — owns the focus ring.
      className="group block h-full rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <Card
        as="article"
        padding="none"
        className={cn(
          'flex h-full flex-col overflow-hidden transition duration-200',
          'group-hover:-translate-y-1 group-hover:border-brand-200 group-hover:shadow-lift',
          'dark:group-hover:border-brand-800',
          'motion-reduce:transition-none motion-reduce:group-hover:translate-y-0',
        )}
      >
        <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-b from-neutral-50 to-neutral-100/70 dark:from-neutral-800 dark:to-neutral-800/40">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              // The card's heading already names the product, so the photo stays decorative.
              alt=""
              fill
              sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 45vw, 90vw"
              className="object-contain p-4 transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
          ) : (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8 fill-neutral-300 dark:fill-neutral-600">
                <path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 12h16v-2.6l-3.7-3.7-4 4-2.6-2.6L4 14.4V17Zm3.6-6.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" />
              </svg>
              {t('noImage')}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <p className="line-clamp-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-400">
            {brands.length > 0 ? brands.join(', ') : t('brandsUnknown')}
          </p>
          <h3 className="line-clamp-2 text-sm font-semibold text-neutral-900 transition-colors group-hover:text-brand-700 dark:text-neutral-100 dark:group-hover:text-brand-300">
            {name ? name : t('nameUnknown')}
          </h3>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-black/5 pt-3 dark:border-white/10">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{product.quantity ?? ''}</span>
            <NutriScoreBadge grade={product.nutriscoreGrade} size="sm" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
