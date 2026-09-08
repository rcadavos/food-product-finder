/**
 * Thin HTTP layer over the Open Food Facts API. It knows about URLs, headers,
 * timeouts, caching and error translation - nothing about our own shapes.
 */

import { env } from '../../config/env';
import { TtlCache } from '../../lib/cache';
import { rateLimited, upstream, upstreamTimeout } from '../../lib/httpError';
import { logger } from '../../lib/logger';
import type { Locale } from '../../types/api';
import type { OffProductResponse, OffSearchResponse } from './types';

export interface OffSearchParams {
  term: string;
  locale: Locale;
  page: number;
  pageSize: number;
}

export interface OffProductParams {
  barcode: string;
  locale: Locale;
}

/** The languages we ask OFF to include as suffixed text fields. */
const TEXT_LOCALES = ['en', 'nl', 'de', 'fr'] as const;

const SEARCH_FIELDS = [
  'code',
  'product_name',
  ...TEXT_LOCALES.map((locale) => `product_name_${locale}`),
  'brands',
  'quantity',
  'image_front_small_url',
  'image_front_url',
  'image_url',
  'nutriscore_grade',
].join(',');

/**
 * Open Food Facts throttles free-text search to roughly ten requests per minute
 * per client, so this cache is load-bearing rather than a micro-optimisation:
 * without it a handful of repeated searches gets the whole app rate-limited.
 */
const responseCache = new TtlCache<object>({
  ttlMs: env.OFF_CACHE_TTL_MS,
  maxEntries: env.OFF_CACHE_MAX_ENTRIES,
});

export function clearOffCache(): void {
  responseCache.clear();
}

/**
 * Free-text search runs against the v1 CGI endpoint on purpose: the v2
 * `/api/v2/search` endpoint does not support `search_terms` and answers such
 * requests with an HTML error page.
 */
export async function searchProducts(params: OffSearchParams): Promise<OffSearchResponse> {
  const url = buildUrl('/cgi/search.pl', {
    search_terms: params.term,
    search_simple: '1',
    action: 'process',
    json: '1',
    page: String(params.page),
    page_size: String(params.pageSize),
    lc: params.locale,
    fields: SEARCH_FIELDS,
  });
  return requestJson<OffSearchResponse>(url);
}

export async function getProduct(params: OffProductParams): Promise<OffProductResponse> {
  const url = buildUrl(`/api/v2/product/${encodeURIComponent(params.barcode)}.json`, {
    lc: params.locale,
    fields: detailFields(params.locale),
  });
  return requestJson<OffProductResponse>(url);
}

function detailFields(locale: Locale): string {
  return [
    'code',
    ...localizedTextFields('product_name'),
    ...localizedTextFields('generic_name'),
    ...localizedTextFields('ingredients_text'),
    'brands',
    'quantity',
    'serving_size',
    'image_front_url',
    'image_front_small_url',
    'image_url',
    'nutriscore_grade',
    'nova_group',
    'ecoscore_grade',
    'nutriments',
    `categories_tags_${locale}`,
    `labels_tags_${locale}`,
    `allergens_tags_${locale}`,
    `countries_tags_${locale}`,
    'categories_tags',
    'labels_tags',
    'allergens_tags',
    'countries_tags',
  ].join(',');
}

function localizedTextFields(baseKey: string): string[] {
  return [baseKey, ...TEXT_LOCALES.map((locale) => `${baseKey}_${locale}`)];
}

function buildUrl(path: string, query: Record<string, string>): string {
  const url = new URL(`${env.OFF_BASE_URL.replace(/\/+$/, '')}${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function requestJson<T extends object>(url: string): Promise<T> {
  const cached = responseCache.get(url);
  if (cached !== undefined) {
    logger.debug('open food facts cache hit', { url });
    return cached as T;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': env.OFF_USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(env.OFF_TIMEOUT_MS),
    });
  } catch (error) {
    if (isAbort(error)) {
      logger.warn('open food facts timed out', { url, timeoutMs: env.OFF_TIMEOUT_MS });
      throw upstreamTimeout();
    }
    logger.error('open food facts request failed', { url, error: describeError(error) });
    throw upstream();
  }

  if (response.status === 429) {
    logger.warn('open food facts rate limited us', { url });
    throw rateLimited();
  }
  if (!response.ok) {
    logger.error('open food facts returned an error status', { url, status: response.status });
    throw upstream();
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    // OFF answers some malformed requests with an HTML error page.
    logger.error('open food facts returned a non-JSON body', { url, error: describeError(error) });
    throw upstream();
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    logger.error('open food facts returned an unexpected payload', { url });
    throw upstream();
  }

  // Only successful responses are cached, so a transient failure is retried.
  responseCache.set(url, payload);
  return payload as T;
}

function isAbort(error: unknown): boolean {
  const name = errorName(error);
  return name === 'AbortError' || name === 'TimeoutError';
}

function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string') {
    return error.name;
  }
  return '';
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
