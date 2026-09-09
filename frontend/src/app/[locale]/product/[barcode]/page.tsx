import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';
import {
  CountryList,
  FallbackNotice,
  InfoRow,
  LockedNutrition,
  NutriScoreBadge,
  NutritionTable,
  TagList,
} from '@/components';
import { buttonClasses, ButtonLink, Card, Container, VisuallyHidden } from '@/components/ui';
import { defaultLocale, locales } from '@/i18n/routing';
import { ApiClientError, getProduct } from '@/lib/api';
import type { Locale, ProductDetail, ProductResponse } from '@/lib/types';

// Entitlement is resolved per request, so this page can never be cached.
export const dynamic = 'force-dynamic';

const BARCODE_PATTERN = /^\d{4,20}$/;

const MUTED_CLASS = 'text-neutral-500 dark:text-neutral-400';

interface ProductPageProps {
  params: Promise<{ locale: string; barcode: string }>;
}

/** Deduplicates the fetch between `generateMetadata` and the page render. */
const loadProduct = cache(
  async (barcode: string, locale: Locale): Promise<ProductResponse> =>
    getProduct({ barcode, locale }),
);

function resolveLocale(raw: string): Locale {
  return hasLocale(locales, raw) ? raw : defaultLocale;
}

function describe(product: ProductDetail): string | null {
  const parts = [product.brands.join(', '), product.quantity].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { locale: rawLocale, barcode } = await params;
  const locale = resolveLocale(rawLocale);
  const tApp = await getTranslations({ locale, namespace: 'app' });
  // The locale layout's title template appends the app name; repeating it here would
  // render "Nutella — Food Product Finder · Food Product Finder". Omitting the title
  // altogether falls back to the layout's own default, which is the app name once.
  const fallback: Metadata = { description: tApp('description') };

  if (!BARCODE_PATTERN.test(barcode)) return fallback;

  try {
    const { product } = await loadProduct(barcode, locale);
    return {
      title: product.name.value ?? barcode,
      description: describe(product) ?? tApp('description'),
    };
  } catch {
    // Metadata must never take the page down; the render below reports the error.
    return fallback;
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { locale: rawLocale, barcode } = await params;
  const locale = resolveLocale(rawLocale);

  if (!BARCODE_PATTERN.test(barcode)) notFound();

  const { product, nutrition, entitled } = await fetchProduct(barcode, locale);
  const t = await getTranslations({ locale, namespace: 'product' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  const name = product.name.value ?? t('nameUnknown');
  const brands = product.brands.length > 0 ? product.brands.join(', ') : t('brandsUnknown');
  const notAvailable = t('incompleteData');

  return (
    <Container className="py-8 sm:py-10">
      <ButtonLink href="/" variant="ghost" size="sm" className="-ml-3">
        <span aria-hidden="true">&larr;</span>
        {t('backToSearch')}
      </ButtonLink>

      <article className="mt-4 space-y-6">
        <Card className="grid gap-6 shadow-lift sm:grid-cols-[minmax(0,20rem)_1fr] sm:gap-8">
          <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-b from-neutral-50 to-neutral-100/70 ring-1 ring-black/5 dark:from-neutral-800 dark:to-neutral-800/40 dark:ring-white/10">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={name}
                fill
                sizes="(min-width: 640px) 18rem, 100vw"
                className="object-contain p-5"
              />
            ) : (
              <p
                className={`flex h-full items-center justify-center p-4 text-center text-sm ${MUTED_CLASS}`}
              >
                {t('noImage')}
              </p>
            )}
          </div>

          <div className="min-w-0">
            {/* The separator is part of the message: French wants a space before the colon. */}
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-400">
              <VisuallyHidden>
                {tCommon('labelledValue', { label: t('brand'), value: brands })}
              </VisuallyHidden>
              <span aria-hidden="true">{brands}</span>
            </p>

            <h1 className="mt-2 text-2xl font-bold text-balance sm:text-4xl">{name}</h1>
            <FallbackNotice source={product.name.source} requestedLocale={locale} />

            {product.genericName.value ? (
              <p className={`mt-2 text-base ${MUTED_CLASS}`}>{product.genericName.value}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {product.nutriscoreGrade ? (
                <NutriScoreBadge grade={product.nutriscoreGrade} size="md" />
              ) : (
                <span className={`text-xs ${MUTED_CLASS}`}>{t('nutriscoreUnknown')}</span>
              )}
              <a
                href={product.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonClasses({ variant: 'ghost', size: 'sm' })}
              >
                {t('viewOnOpenFoodFacts')}
                <span aria-hidden="true">&#8599;</span>
              </a>
            </div>

            <dl className="mt-6 grid gap-x-8 gap-y-3 border-t border-black/5 pt-5 sm:grid-cols-2 dark:border-white/10">
              <InfoRow
                label={t('quantity')}
                value={product.quantity}
                missing={product.quantity === null}
              />
              <InfoRow
                label={t('servingSize')}
                value={product.servingSize}
                missing={product.servingSize === null}
              />
              <InfoRow
                label={t('barcode')}
                value={<span className="font-mono">{product.barcode}</span>}
              />
              <InfoRow
                label={t('novaGroup')}
                value={
                  product.novaGroup === null
                    ? null
                    : t('novaGroupValue', { group: product.novaGroup })
                }
                missing={product.novaGroup === null}
              />
              <InfoRow
                label={t('ecoscore')}
                value={product.ecoscoreGrade ? product.ecoscoreGrade.toUpperCase() : null}
                missing={product.ecoscoreGrade === null}
              />
            </dl>
          </div>
        </Card>

        <Card as="section">
          <h2 className="text-lg font-semibold">{t('ingredients')}</h2>
          <FallbackNotice source={product.ingredientsText.source} requestedLocale={locale} />
          {product.ingredientsText.value ? (
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">
              {product.ingredientsText.value}
            </p>
          ) : (
            <p className={`mt-2 text-sm ${MUTED_CLASS}`}>{notAvailable}</p>
          )}
        </Card>

        <div className="grid gap-6 sm:grid-cols-2">
          <Card as="section">
            <TagList label={t('categories')} tags={product.categories} emptyText={notAvailable} />
          </Card>
          <Card as="section">
            <TagList label={t('labels')} tags={product.labels} emptyText={notAvailable} />
          </Card>
          <Card as="section">
            <TagList label={t('allergens')} tags={product.allergens} emptyText={notAvailable} />
          </Card>
          <Card as="section">
            <CountryList label={t('countries')} countries={product.countries} emptyText={notAvailable} />
          </Card>
        </div>

        {/* Both components bring their own card surface and heading. */}
        {entitled && nutrition ? <NutritionTable nutrition={nutrition} /> : <LockedNutrition />}
      </article>
    </Container>
  );
}

async function fetchProduct(barcode: string, locale: Locale): Promise<ProductResponse> {
  try {
    return await loadProduct(barcode, locale);
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 404 || error.code === 'NOT_FOUND')) {
      notFound();
    }
    throw error;
  }
}
