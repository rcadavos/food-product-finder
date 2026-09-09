/**
 * The Open Food Facts HTTP layer: how upstream failures are translated into our
 * error envelope, and how the TTL cache keeps us under OFF's rate limit.
 *
 * Most of it is driven through the real routes, because the status code the
 * client's error ends up producing is the part that matters. The TTL expiry
 * test calls the client directly so the clock can be faked without a live
 * HTTP server in the way.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../src/lib/prisma', async () => {
  const { prismaMock } = await import('../helpers/prismaMock');
  return { prisma: prismaMock, disconnectPrisma: vi.fn() };
});

vi.mock('../../src/lib/stripe', async () => {
  const { STRIPE_LOCALES, stripeMock } = await import('../helpers/stripeMock');
  return { stripe: stripeMock, STRIPE_LOCALES };
});

import { env } from '../../src/config/env';
import { searchProducts as searchOff } from '../../src/services/openFoodFacts/client';
import type { ProductResponse, SearchResponse } from '../../src/types/api';
import { resetBackendState, testAgent } from '../helpers/app';
import {
  RICH_BARCODE,
  htmlResponse,
  jsonResponse,
  productResponse,
  searchResponse,
  timeoutError,
} from '../helpers/offFixtures';
import { offRequestUrl, offRequestUrls } from '../helpers/offRequestUrls';

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = resetBackendState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Open Food Facts failures', () => {
  it('turns an upstream 500 into 502 UPSTREAM_ERROR', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500));

    const response = await testAgent().get('/api/products').query({ q: 'cola' });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('UPSTREAM_ERROR');
  });

  it('passes an upstream 429 through as 429 RATE_LIMITED', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'slow down' }, 429));

    const response = await testAgent().get('/api/products').query({ q: 'cola' });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });

  it('turns an aborted request into 504 UPSTREAM_TIMEOUT', async () => {
    fetchMock.mockRejectedValue(timeoutError());

    const response = await testAgent().get(`/api/products/${RICH_BARCODE}`);

    expect(response.status).toBe(504);
    expect(response.body.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('turns an HTML error page into 502 UPSTREAM_ERROR', async () => {
    fetchMock.mockResolvedValue(htmlResponse());

    const response = await testAgent().get('/api/products').query({ q: 'cola' });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('UPSTREAM_ERROR');
  });

  it('rejects a JSON body that is not an object with 502 UPSTREAM_ERROR', async () => {
    fetchMock.mockResolvedValue(jsonResponse(['not', 'an', 'object']));

    const response = await testAgent().get('/api/products').query({ q: 'cola' });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('UPSTREAM_ERROR');
  });

  it('does not cache a failure, so the next request retries the upstream', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500));

    const first = await testAgent().get('/api/products').query({ q: 'cola' });
    const second = await testAgent().get('/api/products').query({ q: 'cola' });

    expect(first.status).toBe(502);
    expect(second.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Open Food Facts request caching', () => {
  it('sends the identifying user agent Open Food Facts requires', async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchResponse()));

    await testAgent().get('/api/products').query({ q: 'cola' });

    const init: unknown = fetchMock.mock.calls[0]?.[1];
    expect(init).toMatchObject({
      headers: { 'User-Agent': env.OFF_USER_AGENT, Accept: 'application/json' },
    });
  });

  it('serves a repeated identical search from the cache with a single fetch', async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchResponse()));

    const first = await testAgent().get('/api/products').query({ q: 'cola' });
    const second = await testAgent().get('/api/products').query({ q: 'cola' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body as SearchResponse).toEqual(first.body as SearchResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches a repeated product lookup as well', async () => {
    fetchMock.mockResolvedValue(jsonResponse(productResponse()));

    await testAgent().get(`/api/products/${RICH_BARCODE}`);
    const second = await testAgent().get(`/api/products/${RICH_BARCODE}`);

    expect(second.status).toBe(200);
    expect((second.body as ProductResponse).product.barcode).toBe(RICH_BARCODE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a separate cache entry per language', async () => {
    fetchMock.mockResolvedValue(jsonResponse(productResponse()));

    const english = await testAgent().get(`/api/products/${RICH_BARCODE}`).query({ lang: 'en' });
    const german = await testAgent().get(`/api/products/${RICH_BARCODE}`).query({ lang: 'de' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(offRequestUrls(fetchMock).map((url) => url.searchParams.get('lc'))).toEqual([
      'en',
      'de',
    ]);
    expect((english.body as ProductResponse).product.name.value).toBe('Nutella hazelnut spread');
    expect((german.body as ProductResponse).product.name.value).toBe('Nutella Nuss-Nougat-Creme');
  });

  it('fetches again once the cached entry has outlived its TTL', async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchResponse()));
    const params = { term: 'cola', locale: 'en', page: 1, pageSize: 24 } as const;

    vi.useFakeTimers();

    await searchOff(params);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + env.OFF_CACHE_TTL_MS - 1);
    await searchOff(params);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 2);
    await searchOff(params);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(offRequestUrl(fetchMock, 1).searchParams.get('search_terms')).toBe('cola');
  });
});
