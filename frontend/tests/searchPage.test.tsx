import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SearchPage from '@/app/[locale]/page';
import { getRecentSearches, searchProducts } from '@/lib/api';
import type { SearchResponse } from '@/lib/types';
import en from '../messages/en.json';
import { productSummary } from './helpers/fixtures';
import { setAppSearchParams } from './helpers/nextNavigation';
import { renderWithIntl } from './helpers/render';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  searchProducts: vi.fn(),
  getRecentSearches: vi.fn(),
  clearRecentSearches: vi.fn(),
}));

/** The results summary; `RecentSearches` contributes a second level-2 heading. */
const RESULTS_HEADING = /chocolate/;

function searchResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    query: 'chocolate',
    locale: 'en',
    page: 1,
    pageSize: 24,
    total: 1,
    hasMore: false,
    products: [productSummary()],
    ...overrides,
  };
}

/** A promise the test resolves by hand, so the in-flight state can be observed. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/**
 * The status region is the one that is both polite and atomic; `RecentSearches` has a
 * polite region of its own, so the query has to distinguish them.
 */
function liveRegion(container: HTMLElement): HTMLElement {
  const region = container.querySelector<HTMLElement>('[aria-live="polite"][aria-atomic="true"]');
  if (region === null) throw new Error('The search page renders no polite status region');
  return region;
}

/**
 * The embedded history list loads on its own; waiting for it keeps that state update
 * inside the test rather than leaking into the next one.
 */
async function renderSearchPage(): Promise<HTMLElement> {
  const { container } = renderWithIntl(<SearchPage />);
  await screen.findByText(en.recent.empty);
  return container;
}

beforeEach(() => {
  vi.mocked(getRecentSearches).mockResolvedValue([]);
  vi.mocked(searchProducts).mockResolvedValue(searchResponse());
});

describe('SearchPage status announcements', () => {
  it('mounts the status region before anything is searched, so a later message is announced', async () => {
    const { container } = renderWithIntl(<SearchPage />);

    // A live region inserted in the same commit as its text is silent in every screen
    // reader, which is why the empty region has to be there from the first paint.
    expect(liveRegion(container).textContent).toBe('');

    await screen.findByText(en.recent.empty);
    expect(liveRegion(container).textContent).toBe('');
  });

  it('announces the search, then the result summary, through that same region', async () => {
    const pending = deferred<SearchResponse>();
    vi.mocked(searchProducts).mockReturnValue(pending.promise);
    setAppSearchParams({ q: 'chocolate' });

    const container = await renderSearchPage();
    const region = liveRegion(container);

    await waitFor(() => expect(region).toHaveTextContent(en.search.searching));

    pending.resolve(searchResponse());

    await waitFor(() => expect(region).not.toHaveTextContent(en.search.searching));
    // The heading text is the announcement, so the two can never drift apart.
    const heading = await screen.findByRole('heading', { level: 2, name: RESULTS_HEADING });
    expect(region.textContent).toBe(heading.textContent);
    expect(region.textContent).toContain('chocolate');
    expect(region.isConnected).toBe(true);
  });

  it('keeps the visible heading outside the live region so it is not announced twice', async () => {
    setAppSearchParams({ q: 'chocolate' });

    const container = await renderSearchPage();

    const heading = await screen.findByRole('heading', { level: 2, name: RESULTS_HEADING });
    expect(liveRegion(container).contains(heading)).toBe(false);
  });

  it('announces the empty result instead of leaving the reader waiting', async () => {
    vi.mocked(searchProducts).mockResolvedValue(searchResponse({ total: 0, products: [] }));
    setAppSearchParams({ q: 'chocolate' });

    const container = await renderSearchPage();

    await waitFor(() => expect(liveRegion(container)).toHaveTextContent(en.search.noResultsTitle));
  });

  it('stays silent when the search fails, because the error alert already speaks', async () => {
    vi.mocked(searchProducts).mockRejectedValue(new Error('offline'));
    setAppSearchParams({ q: 'chocolate' });

    const container = await renderSearchPage();

    await screen.findByRole('alert');
    // "No products found" alongside an error would misdescribe what happened.
    expect(liveRegion(container).textContent).toBe('');
  });

  it('says nothing for a term too short to search', async () => {
    setAppSearchParams({ q: 'c' });

    const container = await renderSearchPage();

    expect(screen.getByText(en.search.introTitle)).toBeInTheDocument();
    expect(liveRegion(container).textContent).toBe('');
    expect(searchProducts).not.toHaveBeenCalled();
  });
});
