import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecentSearches } from '@/components/RecentSearches';
import { clearRecentSearches, getRecentSearches } from '@/lib/api';
import type { RecentSearch } from '@/lib/types';
import en from '../messages/en.json';
import { renderWithIntl } from './helpers/render';

/** The list is fed entirely by the history endpoint, so the client is the seam. */
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getRecentSearches: vi.fn(),
  clearRecentSearches: vi.fn(),
}));

function recentSearch(overrides: Partial<RecentSearch> = {}): RecentSearch {
  return {
    id: 'search-1',
    term: 'chocolate',
    locale: 'en',
    resultCount: 12,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const HISTORY = [
  recentSearch(),
  recentSearch({ id: 'search-2', term: 'hummus', resultCount: 3 }),
];

/** `Search again for {term}` — the chip's accessible name. */
function rerunLabel(term: string): string {
  return en.recent.rerun.replace('{term}', term);
}

beforeEach(() => {
  vi.mocked(getRecentSearches).mockResolvedValue(HISTORY);
  vi.mocked(clearRecentSearches).mockResolvedValue(undefined);
});

describe('RecentSearches', () => {
  it('renders one chip per stored term, each naming the search it would repeat', async () => {
    renderWithIntl(<RecentSearches onSelect={vi.fn()} refreshKey={0} />);

    expect(await screen.findByRole('button', { name: rerunLabel('chocolate') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: rerunLabel('hummus') })).toBeInTheDocument();
  });

  it('hands the term back to the page when a chip is pressed', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithIntl(<RecentSearches onSelect={onSelect} refreshKey={0} />);

    await user.click(await screen.findByRole('button', { name: rerunLabel('hummus') }));

    expect(onSelect).toHaveBeenCalledWith('hummus');
  });

  it('keeps the chips and the empty text inside one polite live region, in both states', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(<RecentSearches onSelect={vi.fn()} refreshKey={0} />);

    const region = container.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    await waitFor(() =>
      expect(within(region as HTMLElement).getByRole('list')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: en.recent.clear }));

    // The same node stays mounted, so the swap to the empty text is an announceable change
    // rather than a region that appears alongside its own content.
    expect(region?.isConnected).toBe(true);
    expect(region).toHaveTextContent(en.recent.empty);
  });

  it('clears the list and asks the API to forget it', async () => {
    const user = userEvent.setup();
    renderWithIntl(<RecentSearches onSelect={vi.fn()} refreshKey={0} />);
    await screen.findByRole('button', { name: rerunLabel('chocolate') });

    await user.click(screen.getByRole('button', { name: en.recent.clear }));

    expect(clearRecentSearches).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: rerunLabel('chocolate') })).toBeNull();
    expect(screen.getByText(en.recent.empty)).toBeInTheDocument();
  });

  it('leaves focus on a focusable element after clearing instead of dropping it on the body', async () => {
    const user = userEvent.setup();
    renderWithIntl(<RecentSearches onSelect={vi.fn()} refreshKey={0} />);
    await screen.findByRole('button', { name: rerunLabel('chocolate') });

    await user.click(screen.getByRole('button', { name: en.recent.clear }));

    // Focus dropped to <body> restarts keyboard navigation at the top of the document.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: en.recent.title }));
  });

  it('keeps the clear control mounted but disabled once there is nothing to clear', async () => {
    const user = userEvent.setup();
    renderWithIntl(<RecentSearches onSelect={vi.fn()} refreshKey={0} />);
    await screen.findByRole('button', { name: rerunLabel('chocolate') });

    const clear = screen.getByRole('button', { name: en.recent.clear });
    await user.click(clear);

    expect(clear.isConnected).toBe(true);
    expect(clear).toBeDisabled();
  });

  it('starts disabled when the history endpoint returns nothing', async () => {
    vi.mocked(getRecentSearches).mockResolvedValue([]);
    renderWithIntl(<RecentSearches onSelect={vi.fn()} refreshKey={0} />);

    expect(await screen.findByText(en.recent.empty)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.recent.clear })).toBeDisabled();
  });

  it('shows the empty text rather than a second error banner when the history call fails', async () => {
    vi.mocked(getRecentSearches).mockRejectedValue(new Error('offline'));
    renderWithIntl(<RecentSearches onSelect={vi.fn()} refreshKey={0} />);

    expect(await screen.findByText(en.recent.empty)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
