import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import type { RecentSearch } from '../types/api';

export interface RecordSearchInput {
  userId: string;
  term: string;
  locale: string;
  resultCount: number;
}

export interface GetRecentSearchesInput {
  userId: string;
  limit: number;
}

/** `searches.term` is a VARCHAR(255); queries are validated shorter, this is a floor. */
const MAX_TERM_LENGTH = 255;

/** Read more rows than requested so de-duplication has something to work with. */
const DEDUPE_FETCH_FACTOR = 5;
const DEDUPE_FETCH_CEILING = 200;

/**
 * Recording history is a side effect of searching, never a reason to fail it:
 * a broken history write must not cost the user their results.
 */
export async function recordSearch(input: RecordSearchInput): Promise<void> {
  try {
    await prisma.search.create({
      data: {
        userId: input.userId,
        term: input.term.slice(0, MAX_TERM_LENGTH),
        locale: input.locale,
        resultCount: input.resultCount,
      },
    });
  } catch (error: unknown) {
    logger.error('failed to record search history', {
      userId: input.userId,
      term: input.term,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getRecentSearches(input: GetRecentSearchesInput): Promise<RecentSearch[]> {
  const { userId, limit } = input;
  const rows = await prisma.search.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit * DEDUPE_FETCH_FACTOR, DEDUPE_FETCH_CEILING),
  });

  const seen = new Set<string>();
  const recent: RecentSearch[] = [];

  for (const row of rows) {
    const key = row.term.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    recent.push({
      id: row.id,
      term: row.term,
      locale: row.locale,
      resultCount: row.resultCount,
      createdAt: new Date(row.createdAt).toISOString(),
    });
    if (recent.length >= limit) {
      break;
    }
  }

  return recent;
}

export async function clearSearches(userId: string): Promise<void> {
  await prisma.search.deleteMany({ where: { userId } });
}
