import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClientError,
  apiBaseUrl,
  clearRecentSearches,
  createCheckoutSession,
  createPortalSession,
  getAccount,
  getProduct,
  getRecentSearches,
  searchProducts,
} from '@/lib/api';
import type { SearchResponse } from '@/lib/types';
import { productSummary } from './helpers/fixtures';

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * `tests/setup.ts` installs a fetch that rejects loudly, because no other suite may
 * touch the network. This file is the one place that exercises the fetch layer itself,
 * so every test replaces that stub with its own scripted response.
 */
function stubFetch(impl: FetchImpl) {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

function respondWith(body: unknown, status = 200) {
  return stubFetch(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

/** Fails the test when the call resolves, so a missing rejection can never pass silently. */
async function captureApiError(run: () => Promise<unknown>): Promise<ApiClientError> {
  try {
    await run();
  } catch (caught) {
    if (caught instanceof ApiClientError) return caught;
    throw caught;
  }
  throw new Error('Expected the request to reject with an ApiClientError.');
}

function searchResponse(): SearchResponse {
  return {
    query: 'chocolate',
    locale: 'en',
    page: 1,
    pageSize: 24,
    total: 1,
    hasMore: false,
    products: [productSummary()],
  };
}

function requestedUrl(mock: ReturnType<typeof stubFetch>, call = 0): URL {
  return new URL(String(mock.mock.calls[call]?.[0]));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiBaseUrl', () => {
  it('defaults to the local backend and carries no trailing slash', () => {
    expect(apiBaseUrl).toBe('http://localhost:4000');
  });
});

describe('error handling', () => {
  it('turns the backend error envelope into an ApiClientError carrying status, code and message', async () => {
    respondWith(
      { error: { code: 'SUBSCRIPTION_REQUIRED', message: 'An active subscription is required.' } },
      402,
    );

    const error = await captureApiError(() => getProduct({ barcode: '3017620422003', locale: 'en' }));

    expect(error.name).toBe('ApiClientError');
    expect(error.status).toBe(402);
    expect(error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(error.message).toBe('An active subscription is required.');
  });

  it('keeps the validation details the backend attached to the envelope', async () => {
    const details = { fieldErrors: { q: ['Too short'] } };
    respondWith({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query.', details } }, 400);

    const error = await captureApiError(() => searchProducts({ q: 'a', locale: 'en' }));

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(details);
  });

  it('derives the code from the status when the JSON body is not our envelope', async () => {
    respondWith({ message: 'Nothing here' }, 404);

    const error = await captureApiError(() => getProduct({ barcode: '1234567890123', locale: 'en' }));

    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('The API responded with status 404.');
  });

  it('reports a body that is not JSON at all as NETWORK_ERROR', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    const error = await captureApiError(() => searchProducts({ q: 'chocolate', locale: 'en' }));

    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.status).toBe(502);
    expect(error.message).toBe('The API returned a response that was not JSON.');
  });

  it('reports HTML served with a 200 as NETWORK_ERROR rather than parsing it as a payload', async () => {
    stubFetch(() => Promise.resolve(new Response('<!doctype html><title>proxy</title>', { status: 200 })));

    const error = await captureApiError(() => getAccount());

    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.status).toBe(200);
  });

  it('reports a rejected fetch as NETWORK_ERROR with status 0 and the underlying message', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    const error = await captureApiError(() => getAccount());

    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.status).toBe(0);
    expect(error.message).toBe('Failed to fetch');
  });

  it('reports an empty 200 body as NETWORK_ERROR instead of resolving to null', async () => {
    stubFetch(() => Promise.resolve(new Response('', { status: 200 })));

    const error = await captureApiError(() => getAccount());

    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toBe('The API returned an empty response.');
  });

  it('rethrows an AbortError untouched so a superseded search is not rendered as a failure', async () => {
    const abort = new Error('The operation was aborted.');
    abort.name = 'AbortError';
    stubFetch(() => Promise.reject(abort));

    await expect(searchProducts({ q: 'chocolate', locale: 'en' })).rejects.toBe(abort);
    await expect(searchProducts({ q: 'chocolate', locale: 'en' })).rejects.not.toBeInstanceOf(
      ApiClientError,
    );
  });
});

describe('searchProducts', () => {
  it('resolves with the parsed search payload', async () => {
    const payload = searchResponse();
    respondWith(payload);

    await expect(searchProducts({ q: 'chocolate', locale: 'en' })).resolves.toEqual(payload);
  });

  it('sends cache no-store so a changed entitlement is never served from a cached copy', async () => {
    const mock = respondWith(searchResponse());

    await searchProducts({ q: 'chocolate', locale: 'en' });

    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]?.[1]?.cache).toBe('no-store');
  });

  it('puts the term, language and pagination in the query string', async () => {
    const mock = respondWith(searchResponse());

    await searchProducts({ q: 'olive oil', locale: 'nl', page: 3, pageSize: 12 });

    const url = requestedUrl(mock);
    expect(url.origin + url.pathname).toBe(`${apiBaseUrl}/api/products`);
    expect(url.searchParams.get('q')).toBe('olive oil');
    expect(url.searchParams.get('lang')).toBe('nl');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('pageSize')).toBe('12');
  });

  it('defaults to the first page of 24 results', async () => {
    const mock = respondWith(searchResponse());

    await searchProducts({ q: 'chocolate', locale: 'en' });

    const url = requestedUrl(mock);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('pageSize')).toBe('24');
  });

  it('issues a GET that asks for JSON and forwards the abort signal', async () => {
    const mock = respondWith(searchResponse());
    const controller = new AbortController();

    await searchProducts({ q: 'chocolate', locale: 'en', signal: controller.signal });

    const init = mock.mock.calls[0]?.[1];
    expect(init?.method).toBe('GET');
    expect(init?.headers).toEqual({ Accept: 'application/json' });
    expect(init?.body).toBeUndefined();
    expect(init?.signal).toBe(controller.signal);
  });
});

describe('getProduct', () => {
  it('requests the barcode path with the requested language', async () => {
    const mock = respondWith({ product: {}, nutrition: null, nutritionLocked: true, entitled: false });

    await getProduct({ barcode: '3017620422003', locale: 'de' });

    const url = requestedUrl(mock);
    expect(url.origin).toBe(apiBaseUrl);
    expect(url.pathname).toBe('/api/products/3017620422003');
    expect(url.searchParams.get('lang')).toBe('de');
  });
});

describe('recent searches', () => {
  it('forwards the limit and returns the searches array', async () => {
    const searches = [
      { id: 's1', term: 'chocolate', locale: 'en', resultCount: 42, createdAt: '2026-01-15T12:00:00.000Z' },
    ];
    const mock = respondWith({ searches });

    await expect(getRecentSearches(8)).resolves.toEqual(searches);
    expect(requestedUrl(mock).searchParams.get('limit')).toBe('8');
  });

  it('returns an empty array when the payload has no searches array', async () => {
    respondWith({ searches: null });

    await expect(getRecentSearches()).resolves.toEqual([]);
  });

  it('clears the history with a DELETE and accepts the empty 204 body', async () => {
    const mock = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));

    await expect(clearRecentSearches()).resolves.toBeUndefined();

    expect(requestedUrl(mock).pathname).toBe('/api/searches');
    expect(mock.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });
});

describe('billing', () => {
  it('posts the locale as JSON and returns the checkout URL', async () => {
    const mock = respondWith({ url: 'https://checkout.stripe.com/c/pay/cs_test_123', sessionId: 'cs_test_123' });

    await expect(createCheckoutSession('nl')).resolves.toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      sessionId: 'cs_test_123',
    });

    const init = mock.mock.calls[0]?.[1];
    expect(requestedUrl(mock).pathname).toBe('/api/billing/checkout-session');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' });
    expect(init?.body).toBe(JSON.stringify({ locale: 'nl' }));
  });

  it('surfaces a missing Stripe customer as a VALIDATION_ERROR from the portal endpoint', async () => {
    respondWith(
      { error: { code: 'VALIDATION_ERROR', message: 'No Stripe customer for this user yet.' } },
      400,
    );

    const error = await captureApiError(() => createPortalSession('en'));

    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('No Stripe customer for this user yet.');
  });
});
