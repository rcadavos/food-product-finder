'use client';

import { hasLocale, useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  EmptyState,
  ErrorMessage,
  ProductCardSkeleton,
  ProductGrid,
  RecentSearches,
  SearchForm,
} from '@/components';
import { Button, Card, Container, Skeleton, VisuallyHidden } from '@/components/ui';
import { usePathname, useRouter } from '@/i18n/navigation';
import { defaultLocale, locales } from '@/i18n/routing';
import { searchProducts } from '@/lib/api';
import { errorMessageKeyFor, type ErrorMessageKey } from '@/lib/errorMessages';
import type { Locale, ProductSummary } from '@/lib/types';

/** Mirrors the backend default so "show more" pages line up with the API. */
const PAGE_SIZE = 24;
/** The API rejects anything above this. */
const MAX_PAGE = 50;
/** The API rejects a larger `pageSize`, which is what caps a batched request. */
const MAX_PAGE_SIZE = 48;
const PAGES_PER_REQUEST = MAX_PAGE_SIZE / PAGE_SIZE;
const MIN_TERM_LENGTH = 2;
const SKELETON_COUNT = 8;

const GRID_CLASS = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
const PAGE_CLASS = 'pb-16 pt-10 sm:pb-20 sm:pt-14';

/** What has already been fetched, so a page bump appends instead of refetching. */
interface LoadedState {
  key: string;
  page: number;
}

interface ResultMeta {
  term: string;
  total: number;
  hasMore: boolean;
}

interface FetchStep {
  page: number;
  pageSize: number;
  /** The URL page that is fully loaded once this step has landed. */
  through: number;
}

function parsePage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_PAGE);
}

/**
 * A cold mount on `?q=chocolate&page=12` used to replay twelve requests, one per page.
 * Open Food Facts allows roughly ten searches a minute, so a shared deep link reliably
 * 429'd partway down. The accumulated range now goes out as a single request, and splits
 * only where it would exceed the API's `pageSize` cap — into the fewest capped requests
 * that still tile the range exactly, since an offset is only reachable as a whole
 * multiple of the page size it is asked for.
 */
function planFetch(fromPage: number, toPage: number): FetchStep[] {
  const steps: FetchStep[] = [];

  if (fromPage > 1) {
    // Warm state: "show more" walks forward a page at a time, so there is nothing to batch.
    for (let current = fromPage; current <= toPage; current += 1) {
      steps.push({ page: current, pageSize: PAGE_SIZE, through: current });
    }
    return steps;
  }

  const batches = Math.floor(toPage / PAGES_PER_REQUEST);
  for (let index = 1; index <= batches; index += 1) {
    steps.push({ page: index, pageSize: MAX_PAGE_SIZE, through: index * PAGES_PER_REQUEST });
  }
  if (toPage % PAGES_PER_REQUEST !== 0) {
    // The leftover is one PAGE_SIZE page, so its offset still falls on a page boundary.
    steps.push({ page: toPage, pageSize: PAGE_SIZE, through: toPage });
  }
  return steps;
}

function skeletonKeys(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `skeleton-${index}`);
}

// `useSearchParams` opts its subtree into client-side rendering, so the page
// shell stays prerenderable behind this boundary.
export default function SearchPage() {
  return (
    <Suspense fallback={<SearchPageFallback />}>
      <SearchPageContent />
    </Suspense>
  );
}

function SearchPageContent() {
  const t = useTranslations('search');
  const tApp = useTranslations('app');
  const tCommon = useTranslations('common');
  const tRoot = useTranslations();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawLocale = useLocale();
  const locale: Locale = hasLocale(locales, rawLocale) ? rawLocale : defaultLocale;

  const term = (searchParams.get('q') ?? '').trim();
  const page = parsePage(searchParams.get('page'));
  const hasTerm = term.length >= MIN_TERM_LENGTH;

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [meta, setMeta] = useState<ResultMeta | null>(null);
  const [loading, setLoading] = useState(hasTerm);
  const [errorKey, setErrorKey] = useState<ErrorMessageKey | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef<LoadedState>({ key: '', page: 0 });

  useEffect(() => {
    if (!hasTerm) {
      loaded.current = { key: '', page: 0 };
      setProducts([]);
      setMeta(null);
      setErrorKey(null);
      setLoading(false);
      return;
    }

    const key = `${locale}::${term}`;
    const isNewSearch = loaded.current.key !== key;
    const firstPage = isNewSearch ? 1 : loaded.current.page + 1;
    if (firstPage > page) {
      // Already showing everything the URL asks for, e.g. after a back navigation.
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const run = async (): Promise<void> => {
      setLoading(true);
      setErrorKey(null);
      if (isNewSearch) {
        setProducts([]);
        setMeta(null);
      }

      try {
        let replaceNext = isNewSearch;
        for (const step of planFetch(firstPage, page)) {
          const response = await searchProducts({
            q: term,
            locale,
            page: step.page,
            pageSize: step.pageSize,
            signal: controller.signal,
          });
          if (cancelled) return;

          const replace = replaceNext;
          replaceNext = false;
          setProducts((previous) =>
            replace ? response.products : [...previous, ...response.products],
          );
          setMeta({ term: response.query, total: response.total, hasMore: response.hasMore });
          // Once the API says there is nothing behind the next offset the whole requested
          // range counts as covered, so a later retry cannot ask for an empty tail.
          loaded.current = { key, page: response.hasMore ? step.through : page };
          if (!response.hasMore) break;
        }

        // Only a fresh search adds a row the history list would render
        // differently; paging through the same term does not.
        if (isNewSearch) setRefreshKey((value) => value + 1);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setErrorKey(errorMessageKeyFor(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt, hasTerm, locale, page, term]);

  const navigate = useCallback(
    (nextTerm: string, nextPage: number) => {
      const params = new URLSearchParams();
      if (nextTerm) params.set('q', nextTerm);
      if (nextPage > 1) params.set('page', String(nextPage));
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const handleSubmit = useCallback(
    (nextTerm: string) => {
      navigate(nextTerm.trim(), 1);
    },
    [navigate],
  );

  const handleLoadMore = useCallback(() => {
    // Ask for one past whatever is actually on screen, which can be ahead of
    // the URL if the query string was rewritten while results were kept.
    const nextPage = Math.max(page, loaded.current.page) + 1;
    navigate(term, Math.min(nextPage, MAX_PAGE));
  }, [navigate, page, term]);

  const handleRetry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const resultsHeading = t('resultsFor', {
    count: meta?.total ?? products.length,
    term: meta?.term ?? term,
  });

  let status = '';
  if (hasTerm) {
    if (loading) status = t('searching');
    else if (products.length > 0) status = resultsHeading;
    else if (errorKey === null) status = t('noResultsTitle');
  }

  let results: ReactNode;
  if (errorKey !== null && products.length === 0) {
    results = <ErrorMessage message={tRoot(errorKey)} onRetry={handleRetry} />;
  } else if (!hasTerm) {
    results = <EmptyState title={t('introTitle')} body={t('introBody')} />;
  } else if (loading && products.length === 0) {
    results = (
      <div className={GRID_CLASS}>
        {skeletonKeys(SKELETON_COUNT).map((key) => (
          <ProductCardSkeleton key={key} />
        ))}
      </div>
    );
  } else if (products.length === 0) {
    results = <EmptyState title={t('noResultsTitle')} body={t('noResultsBody')} />;
  } else {
    results = (
      <>
        <h2 className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
          {resultsHeading}
        </h2>
        <div className="mt-4">
          <ProductGrid products={products} />
        </div>
        {errorKey !== null ? (
          <ErrorMessage message={tRoot(errorKey)} onRetry={handleRetry} className="mt-6" />
        ) : null}
        {meta?.hasMore && page < MAX_PAGE ? (
          <div className="mt-8 flex justify-center">
            <Button variant="secondary" loading={loading} onClick={handleLoadMore}>
              {loading ? t('searching') : t('loadMore')}
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <Container className={PAGE_CLASS}>
      <header className="mx-auto max-w-3xl text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-brand-200/70 bg-white/70 px-3 py-1 text-xs font-medium text-brand-800 backdrop-blur dark:border-brand-800/50 dark:bg-neutral-900/60 dark:text-brand-200">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-500" />
          {tCommon('poweredBy')}
        </p>
        <h1 className="mt-4 text-balance text-3xl font-bold sm:text-5xl">{tApp('tagline')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-base text-neutral-600 dark:text-neutral-300">
          {tApp('description')}
        </p>
      </header>

      {/* Lifted above the hero wash so the primary action reads as the focal point. */}
      <Card padding="sm" className="mx-auto mt-8 max-w-3xl shadow-lift">
        <SearchForm initialTerm={term} pending={loading} onSubmit={handleSubmit} />
        <div className="mt-4">
          <RecentSearches onSelect={handleSubmit} refreshKey={refreshKey} />
        </div>
      </Card>

      {/* Mounted on every render, empty or not: a live region that appears in the same
          commit as its text is never announced. */}
      <div aria-live="polite" aria-atomic="true">
        <VisuallyHidden>{status}</VisuallyHidden>
      </div>

      <section className="mt-10" aria-busy={loading}>
        {results}
      </section>
    </Container>
  );
}

function SearchPageFallback() {
  const tApp = useTranslations('app');

  return (
    <Container className={PAGE_CLASS}>
      <header className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold text-balance sm:text-5xl">{tApp('tagline')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-base text-neutral-600 dark:text-neutral-300">
          {tApp('description')}
        </p>
      </header>
      <Skeleton className="mx-auto mt-8 h-24 max-w-3xl rounded-[var(--radius-card)]" />
      <div className={`mt-10 ${GRID_CLASS}`}>
        {skeletonKeys(SKELETON_COUNT).map((key) => (
          <ProductCardSkeleton key={key} />
        ))}
      </div>
    </Container>
  );
}
