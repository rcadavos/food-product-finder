/**
 * GET /api/products — the search endpoint end to end: validation, the Open
 * Food Facts request it makes, the shape it answers with, and the history row
 * it writes as a side effect.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../src/lib/prisma', async () => {
  const { prismaMock } = await import('../helpers/prismaMock');
  return { prisma: prismaMock, disconnectPrisma: vi.fn() };
});

vi.mock('../../src/lib/stripe', async () => {
  const { STRIPE_LOCALES, stripeMock } = await import('../helpers/stripeMock');
  return { stripe: stripeMock, STRIPE_LOCALES };
});

// Wrapped rather than replaced: the real implementation still writes through
// the Prisma mock, so both the row and the call can be asserted, while a single
// test can make the call reject to prove the route survives it.
vi.mock('../../src/services/searchHistoryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/searchHistoryService')>();
  return { ...actual, recordSearch: vi.fn(actual.recordSearch) };
});

import { recordSearch } from '../../src/services/searchHistoryService';
import type { SearchResponse } from '../../src/types/api';
import { resetBackendState, testAgent } from '../helpers/app';
import { emptySearchResponse, jsonResponse, searchResponse } from '../helpers/offFixtures';
import type { OffSearchResponse } from '../../src/services/openFoodFacts/types';
import { offRequestUrl } from '../helpers/offRequestUrls';
import { DEMO_USER_ID, prismaMock } from '../helpers/prismaMock';

let fetchMock: Mock;
let realRecordSearch: typeof recordSearch;

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('../../src/services/searchHistoryService')>(
    '../../src/services/searchHistoryService',
  );
  realRecordSearch = actual.recordSearch;
});

beforeEach(() => {
  fetchMock = resetBackendState();
  vi.mocked(recordSearch).mockImplementation(realRecordSearch);
});

describe('GET /api/products', () => {
  it('maps the Open Food Facts search payload into a SearchResponse', async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchResponse()));

    const response = await testAgent().get('/api/products').query({ q: 'cola' });

    expect(response.status).toBe(200);
    const body = response.body as SearchResponse;
    expect(body.query).toBe('cola');
    expect(body.locale).toBe('en');
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(24);
    expect(body.total).toBe(57);
    expect(body.hasMore).toBe(true);

    // The fixture's third entry has no barcode and cannot be linked to.
    expect(body.products).toHaveLength(2);
    expect(body.products[0]).toEqual({
      barcode: '5449000000996',
      name: { value: 'Coca-Cola', source: 'default' },
      brands: ['Coca-Cola'],
      imageUrl:
        'https://images.openfoodfacts.org/images/products/544/900/000/0996/front_nl.400.jpg',
      quantity: '1.5 l',
      nutriscoreGrade: 'e',
      missingFields: [],
    });
    expect(body.products[1]?.barcode).toBe('1234567890123');
    expect(body.products[1]?.missingFields).toEqual([
      'name',
      'brands',
      'imageUrl',
      'quantity',
      'nutriscoreGrade',
    ]);
  });

  it('records exactly one search row with the trimmed term, locale and result count', async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchResponse()));

    const response = await testAgent()
      .get('/api/products')
      .query({ q: '   chocolade   ', lang: 'nl' });

    expect(response.status).toBe(200);
    expect((response.body as SearchResponse).query).toBe('chocolade');

    expect(vi.mocked(recordSearch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordSearch)).toHaveBeenCalledWith({
      userId: DEMO_USER_ID,
      term: 'chocolade',
      locale: 'nl',
      resultCount: 57,
    });
    expect(prismaMock.search.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.search.create).toHaveBeenCalledWith({
      data: { userId: DEMO_USER_ID, term: 'chocolade', locale: 'nl', resultCount: 57 },
    });
  });

  it('rejects a request without a q parameter with 400 VALIDATION_ERROR', async () => {
    const response = await testAgent().get('/api/products');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.fieldErrors.q).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prismaMock.search.create).not.toHaveBeenCalled();
  });

  it('rejects a single-character query with 400 VALIDATION_ERROR', async () => {
    const response = await testAgent().get('/api/products').query({ q: 'a' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a query longer than 100 characters with 400 VALIDATION_ERROR', async () => {
    const response = await testAgent().get('/api/products').query({ q: 'a'.repeat(101) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 200 with an empty list instead of 404 when nothing matches', async () => {
    fetchMock.mockResolvedValue(jsonResponse(emptySearchResponse()));

    const response = await testAgent().get('/api/products').query({ q: 'zzzznotafood' });

    expect(response.status).toBe(200);
    const body = response.body as SearchResponse;
    expect(body.products).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.hasMore).toBe(false);
    expect(prismaMock.search.create).toHaveBeenCalledWith({
      data: { userId: DEMO_USER_ID, term: 'zzzznotafood', locale: 'en', resultCount: 0 },
    });
  });

  it('still returns the results when recording the search history rejects', async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchResponse()));
    vi.mocked(recordSearch).mockRejectedValueOnce(new Error('history table is on fire'));

    const response = await testAgent().get('/api/products').query({ q: 'cola' });

    expect(response.status).toBe(200);
    expect((response.body as SearchResponse).products).toHaveLength(2);
    expect(vi.mocked(recordSearch)).toHaveBeenCalledTimes(1);
  });

  /**
   * Open Food Facts sets `page_count` to the number of products it put in the
   * page, not to the number of pages that exist. Reading it as a page total
   * made `hasMore` true for almost every single-page result set, which the UI
   * turned into a "Show more" button that fetched nothing.
   */
  it('reports hasMore false when the whole result set fits on one page', async () => {
    const onePage: OffSearchResponse = {
      ...searchResponse(),
      count: 2,
      page: 1,
      page_count: 3,
      page_size: 24,
    };
    fetchMock.mockResolvedValue(jsonResponse(onePage));

    const response = await testAgent().get('/api/products').query({ q: 'cola' });

    expect(response.status).toBe(200);
    const body = response.body as SearchResponse;
    expect(body.total).toBe(2);
    expect(body.products).toHaveLength(2);
    expect(body.hasMore).toBe(false);
  });

  it('reports hasMore true while the total reaches past the current page', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...searchResponse(), count: 57, page: 2 }));

    const response = await testAgent()
      .get('/api/products')
      .query({ q: 'cola', page: 2, pageSize: 24 });

    expect(response.status).toBe(200);
    expect((response.body as SearchResponse).hasMore).toBe(true);
  });

  it('reports hasMore false on the last page of a multi-page result set', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...searchResponse(), count: 57, page: 3 }));

    const response = await testAgent()
      .get('/api/products')
      .query({ q: 'cola', page: 3, pageSize: 24 });

    expect(response.status).toBe(200);
    const body = response.body as SearchResponse;
    expect(body.total).toBe(57);
    expect(body.hasMore).toBe(false);
  });

  it('asks Open Food Facts for the requested language', async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchResponse()));

    await testAgent().get('/api/products').query({ q: 'schokolade', lang: 'de', page: 2, pageSize: 12 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = offRequestUrl(fetchMock);
    expect(url.pathname).toBe('/cgi/search.pl');
    expect(url.searchParams.get('lc')).toBe('de');
    expect(url.searchParams.get('search_terms')).toBe('schokolade');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('page_size')).toBe('12');
  });
});
