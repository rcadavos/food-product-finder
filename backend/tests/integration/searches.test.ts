/**
 * `/api/searches` — the demo user's recent-search history.
 *
 * The Prisma layer is a mock, so these tests can hand the route the exact row
 * set a real database would return (already ordered by `createdAt desc`) and
 * assert what the service does with it: collapse repeats and cut to `limit`.
 */

import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DEMO_USER_ID, makeSearch, prismaMock } from '../helpers/prismaMock';
import { createTestApp, resetBackendState } from '../helpers/app';
import type { RecentSearch } from '../../src/types/api';

vi.mock('../../src/lib/prisma', async () => {
  const { prismaMock: mock } = await import('../helpers/prismaMock');
  return { prisma: mock, disconnectPrisma: vi.fn() };
});

interface FindManyArgs {
  where: { userId: string };
  orderBy: { createdAt: 'asc' | 'desc' };
  take: number;
}

interface DeleteManyArgs {
  where: { userId: string };
}

function firstCallArg<T>(mock: Mock): T {
  const call = mock.mock.calls[0];
  expect(call, 'expected the Prisma method to have been called').toBeDefined();
  return call![0] as T;
}

/** Rows as MySQL would hand them back for `orderBy: { createdAt: 'desc' }`. */
function newestFirst(rows: Array<{ id: string; term: string; minutesAgo: number; resultCount?: number }>) {
  const base = Date.parse('2026-01-15T12:00:00.000Z');
  return rows.map((row) =>
    makeSearch({
      id: row.id,
      term: row.term,
      resultCount: row.resultCount ?? 3,
      createdAt: new Date(base - row.minutesAgo * 60_000),
    }),
  );
}

describe('GET /api/searches', () => {
  beforeEach(() => {
    resetBackendState();
  });

  it('returns the newest entry of each term and drops the older repeats', async () => {
    prismaMock.search.findMany.mockResolvedValue(
      newestFirst([
        { id: 'sch_4', term: 'Chocolate', minutesAgo: 1, resultCount: 42 },
        { id: 'sch_3', term: 'yoghurt', minutesAgo: 5 },
        { id: 'sch_2', term: 'chocolate', minutesAgo: 30, resultCount: 41 },
        { id: 'sch_1', term: 'CHOCOLATE', minutesAgo: 90, resultCount: 40 },
      ]),
    );

    const response = await request(createTestApp()).get('/api/searches');

    expect(response.status).toBe(200);
    const searches = response.body.searches as RecentSearch[];
    expect(searches.map((entry) => entry.id)).toEqual(['sch_4', 'sch_3']);
    expect(searches[0]).toEqual({
      id: 'sch_4',
      term: 'Chocolate',
      locale: 'en',
      resultCount: 42,
      createdAt: '2026-01-15T11:59:00.000Z',
    });
  });

  it('orders the surviving entries newest first', async () => {
    prismaMock.search.findMany.mockResolvedValue(
      newestFirst([
        { id: 'sch_c', term: 'olive oil', minutesAgo: 2 },
        { id: 'sch_b', term: 'yoghurt', minutesAgo: 20 },
        { id: 'sch_a', term: 'chocolate', minutesAgo: 200 },
      ]),
    );

    const response = await request(createTestApp()).get('/api/searches');

    const searches = response.body.searches as RecentSearch[];
    expect(searches.map((entry) => entry.term)).toEqual(['olive oil', 'yoghurt', 'chocolate']);
    const timestamps = searches.map((entry) => Date.parse(entry.createdAt));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });

  it('reads only the requesting user’s rows and over-reads so de-duplication has material', async () => {
    prismaMock.search.findMany.mockResolvedValue([]);

    await request(createTestApp()).get('/api/searches?limit=4').expect(200);

    const args = firstCallArg<FindManyArgs>(prismaMock.search.findMany);
    expect(args.where).toEqual({ userId: DEMO_USER_ID });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.take).toBeGreaterThan(4);
  });

  it('returns at most `limit` entries', async () => {
    prismaMock.search.findMany.mockResolvedValue(
      newestFirst([
        { id: 'sch_5', term: 'apple', minutesAgo: 1 },
        { id: 'sch_4', term: 'banana', minutesAgo: 2 },
        { id: 'sch_3', term: 'cheese', minutesAgo: 3 },
        { id: 'sch_2', term: 'dates', minutesAgo: 4 },
        { id: 'sch_1', term: 'eggs', minutesAgo: 5 },
      ]),
    );

    const response = await request(createTestApp()).get('/api/searches?limit=2');

    expect(response.status).toBe(200);
    expect(response.body.searches as RecentSearch[]).toHaveLength(2);
    expect((response.body.searches as RecentSearch[]).map((entry) => entry.term)).toEqual([
      'apple',
      'banana',
    ]);
  });

  it('defaults to ten entries when no limit is given', async () => {
    prismaMock.search.findMany.mockResolvedValue(
      newestFirst(
        Array.from({ length: 14 }, (_unused, index) => ({
          id: `sch_${index}`,
          term: `term-${index}`,
          minutesAgo: index + 1,
        })),
      ),
    );

    const response = await request(createTestApp()).get('/api/searches');

    expect(response.body.searches as RecentSearch[]).toHaveLength(10);
  });

  /**
   * A client that always appends the key sends `?limit=` for a blank field.
   * Coercing that empty string to `0` and failing the range check turned an
   * unset optional parameter into a 400.
   */
  it('treats an empty limit as unset and falls back to the default of ten', async () => {
    prismaMock.search.findMany.mockResolvedValue(
      newestFirst(
        Array.from({ length: 14 }, (_unused, index) => ({
          id: `sch_${index}`,
          term: `term-${index}`,
          minutesAgo: index + 1,
        })),
      ),
    );

    const response = await request(createTestApp()).get('/api/searches?limit=');

    expect(response.status).toBe(200);
    expect(response.body.searches as RecentSearch[]).toHaveLength(10);
  });

  it('returns an empty list rather than 404 when the user has no history', async () => {
    prismaMock.search.findMany.mockResolvedValue([]);

    const response = await request(createTestApp()).get('/api/searches');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ searches: [] });
  });

  it('rejects limit=0 with 400 VALIDATION_ERROR and reads nothing', async () => {
    const response = await request(createTestApp()).get('/api/searches?limit=0');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toBeDefined();
    expect(prismaMock.search.findMany).not.toHaveBeenCalled();
  });

  it('rejects limit=51 with 400 VALIDATION_ERROR and reads nothing', async () => {
    const response = await request(createTestApp()).get('/api/searches?limit=51');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(prismaMock.search.findMany).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric limit with 400 VALIDATION_ERROR', async () => {
    const response = await request(createTestApp()).get('/api/searches?limit=lots');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(prismaMock.search.findMany).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/searches', () => {
  beforeEach(() => {
    resetBackendState();
  });

  it('answers 204 with an empty body', async () => {
    prismaMock.search.deleteMany.mockResolvedValue({ count: 7 });

    const response = await request(createTestApp()).delete('/api/searches');

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });

  it('deletes only the demo user’s rows', async () => {
    await request(createTestApp()).delete('/api/searches').expect(204);

    expect(prismaMock.search.deleteMany).toHaveBeenCalledTimes(1);
    expect(firstCallArg<DeleteManyArgs>(prismaMock.search.deleteMany)).toEqual({
      where: { userId: DEMO_USER_ID },
    });
  });

  it('leaves the history readable and empty afterwards', async () => {
    const agent = request(createTestApp());
    await agent.delete('/api/searches').expect(204);

    prismaMock.search.findMany.mockResolvedValue([]);
    const response = await agent.get('/api/searches');

    expect(response.status).toBe(200);
    expect(response.body.searches).toEqual([]);
  });
});
