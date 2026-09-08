import type {
  AccountResponse,
  ErrorCode,
  Locale,
  ProductResponse,
  RecentSearch,
  SearchResponse,
} from '@/lib/types';

/** Every code `ApiClientError.code` can carry: the API's own codes plus a client-side one. */
export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR';

export interface CheckoutSessionResponse {
  url: string;
  sessionId: string;
}

export interface PortalSessionResponse {
  url: string;
}

export interface ConfirmCheckoutResponse {
  subscription: AccountResponse['subscription'];
}

export interface SearchProductsParams {
  q: string;
  locale: Locale;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

export interface GetProductParams {
  barcode: string;
  locale: Locale;
  signal?: AbortSignal;
}

const API_ERROR_CODES: readonly string[] = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'SUBSCRIPTION_REQUIRED',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'UPSTREAM_TIMEOUT',
  'INTERNAL_ERROR',
];

function readEnv(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

const PUBLIC_BASE_URL = readEnv(process.env.NEXT_PUBLIC_API_BASE_URL) ?? 'http://localhost:4000';

/**
 * The browser and the Next.js server can reach the API under different hostnames
 * (container networking, reverse proxies), so server-side fetches prefer the internal URL.
 * Resolved once at module load: `window` never appears or disappears mid-process.
 */
export const apiBaseUrl = (
  typeof window === 'undefined'
    ? (readEnv(process.env.API_BASE_URL_INTERNAL) ?? PUBLIC_BASE_URL)
    : PUBLIC_BASE_URL
).replace(/\/+$/, '');

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(message: string, init: { status: number; code: ApiErrorCode; details?: unknown }) {
    super(message);
    this.name = 'ApiClientError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
  }
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError';
}

function isApiErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && API_ERROR_CODES.includes(value);
}

/** Best-effort mapping for a non-2xx response whose body did not carry our envelope. */
function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 402:
      return 'SUBSCRIPTION_REQUIRED';
    case 404:
      return 'NOT_FOUND';
    case 429:
      return 'RATE_LIMITED';
    case 502:
      return 'UPSTREAM_ERROR';
    case 504:
      return 'UPSTREAM_TIMEOUT';
    default:
      return 'INTERNAL_ERROR';
  }
}

function readErrorEnvelope(
  payload: unknown,
): { code: ErrorCode; message: string; details: unknown } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { error } = payload as { error?: unknown };
  if (typeof error !== 'object' || error === null) return null;

  const { code, message, details } = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  if (!isApiErrorCode(code) || typeof message !== 'string' || message === '') return null;
  return { code, message, details };
}

async function parseBody(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ApiClientError('The API response could not be read.', {
      status: response.status,
      code: 'NETWORK_ERROR',
    });
  }

  if (text.trim() === '') return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiClientError('The API returned a response that was not JSON.', {
      status: response.status,
      code: 'NETWORK_ERROR',
    });
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      // Product data and entitlement both change out from under us; never serve a cached copy.
      cache: 'no-store',
    });
  } catch (cause) {
    // A deliberate abort is control flow (a superseded search), not something to render.
    if (isAbortError(cause)) throw cause;
    throw new ApiClientError(
      cause instanceof Error && cause.message !== '' ? cause.message : 'Could not reach the API.',
      { status: 0, code: 'NETWORK_ERROR' },
    );
  }

  if (response.status === 204) return undefined as T;

  const payload = await parseBody(response);

  if (!response.ok) {
    const envelope = readErrorEnvelope(payload);
    throw new ApiClientError(
      envelope?.message ?? `The API responded with status ${response.status}.`,
      {
        status: response.status,
        code: envelope?.code ?? codeForStatus(response.status),
        details: envelope?.details,
      },
    );
  }

  if (payload === null) {
    throw new ApiClientError('The API returned an empty response.', {
      status: response.status,
      code: 'NETWORK_ERROR',
    });
  }

  return payload as T;
}

export function getAccount(signal?: AbortSignal): Promise<AccountResponse> {
  return request<AccountResponse>('/api/me', { signal });
}

export function searchProducts({
  q,
  locale,
  page = 1,
  pageSize = 24,
  signal,
}: SearchProductsParams): Promise<SearchResponse> {
  const query = new URLSearchParams({
    q,
    lang: locale,
    page: String(page),
    pageSize: String(pageSize),
  });
  return request<SearchResponse>(`/api/products?${query.toString()}`, { signal });
}

export function getProduct({ barcode, locale, signal }: GetProductParams): Promise<ProductResponse> {
  const query = new URLSearchParams({ lang: locale });
  return request<ProductResponse>(
    `/api/products/${encodeURIComponent(barcode)}?${query.toString()}`,
    { signal },
  );
}

export async function getRecentSearches(limit = 10, signal?: AbortSignal): Promise<RecentSearch[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  const data = await request<{ searches: RecentSearch[] }>(`/api/searches?${query.toString()}`, {
    signal,
  });
  return Array.isArray(data.searches) ? data.searches : [];
}

export function clearRecentSearches(): Promise<void> {
  return request<void>('/api/searches', { method: 'DELETE' });
}

/**
 * `returnPath` is the locale-less path the user pressed Subscribe on, so Checkout
 * can send them back there instead of stranding them on the billing page.
 */
export function createCheckoutSession(
  locale: Locale,
  returnPath?: string,
): Promise<CheckoutSessionResponse> {
  return request<CheckoutSessionResponse>('/api/billing/checkout-session', {
    method: 'POST',
    body: returnPath === undefined ? { locale } : { locale, returnPath },
  });
}

/**
 * Reconciles a finished Checkout straight from the redirect, so entitlement does
 * not depend on the webhook having been delivered.
 */
export function confirmCheckout(sessionId: string): Promise<ConfirmCheckoutResponse> {
  return request<ConfirmCheckoutResponse>('/api/billing/confirm', {
    method: 'POST',
    body: { sessionId },
  });
}

export function createPortalSession(locale: Locale): Promise<PortalSessionResponse> {
  return request<PortalSessionResponse>('/api/billing/portal-session', {
    method: 'POST',
    body: { locale },
  });
}
