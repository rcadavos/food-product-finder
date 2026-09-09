'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { defaultLocale, locales } from '@/i18n/routing';
import { clearRecentSearches, getRecentSearches } from '@/lib/api';
import { formatRelativeDate } from '@/lib/format';
import type { RecentSearch } from '@/lib/types';
import { Button, Skeleton } from './ui';

interface RecentSearchesProps {
  onSelect: (term: string) => void;
  refreshKey: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRecentSearch(value: unknown): value is RecentSearch {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.term === 'string' &&
    typeof value.locale === 'string' &&
    typeof value.resultCount === 'number' &&
    typeof value.createdAt === 'string'
  );
}

/** History rows land straight in the UI, so their shape is checked at the boundary. */
function toRecentSearches(payload: unknown): RecentSearch[] {
  const rows = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.searches)
      ? payload.searches
      : [];
  return rows.filter(isRecentSearch);
}

export function RecentSearches({ onSelect, refreshKey }: RecentSearchesProps) {
  const t = useTranslations('recent');
  const activeLocale = useLocale();
  const locale = locales.find((candidate) => candidate === activeLocale) ?? defaultLocale;
  const [items, setItems] = useState<RecentSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const payload: unknown = await getRecentSearches(8);
        if (!cancelled) setItems(toRecentSearches(payload));
      } catch {
        // History is supplementary: a failure here must not add a second error banner
        // next to the one the search itself already shows.
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function handleClear() {
    setItems([]);
    // Clearing disables the button that was just pressed, so focus is parked on the
    // section heading instead of being dropped on the document body.
    headingRef.current?.focus();
    try {
      await clearRecentSearches();
    } catch {
      // The list is already empty on screen; the next load shows whatever survived.
    }
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600 dark:text-neutral-100"
        >
          {t('title')}
        </h2>
        {/* Stays mounted once the list empties, so the control never disappears under the pointer. */}
        <Button
          variant="ghost"
          size="sm"
          disabled={items.length === 0}
          onClick={() => {
            void handleClear();
          }}
          className="font-medium underline underline-offset-2"
        >
          {t('clear')}
        </Button>
      </div>

      {/* One region in every state, so clearing is announced instead of silently swapping nodes. */}
      <div aria-live="polite">
        {loading ? (
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-32 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('empty')}</p>
        ) : (
          <ul role="list" className="flex flex-wrap gap-2">
            {items.map((item) => (
              <li key={item.id}>
                <Button
                  variant="chip"
                  size="sm"
                  onClick={() => onSelect(item.term)}
                  aria-label={t('rerun', { term: item.term })}
                  className="py-1.5 dark:hover:border-brand-700"
                >
                  <span className="font-medium text-neutral-800 dark:text-neutral-100">{item.term}</span>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {t('resultCount', { count: item.resultCount })}
                  </span>
                  <time dateTime={item.createdAt} className="hidden text-neutral-400 sm:inline dark:text-neutral-500">
                    {formatRelativeDate(item.createdAt, locale)}
                  </time>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
