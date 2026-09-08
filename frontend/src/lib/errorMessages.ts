/**
 * Single mapping from an API failure to a key in the `errors` message
 * namespace. Every surface (search, product page, error boundary, buttons)
 * goes through this so the same backend `code` always produces the same
 * wording in the same language.
 */
export type ErrorMessageKey =
  | 'errors.generic'
  | 'errors.network'
  | 'errors.notFound'
  | 'errors.rateLimited'
  | 'errors.subscriptionExists'
  | 'errors.subscriptionRequired'
  | 'errors.upstream'
  | 'errors.validation';

/**
 * Keys are the backend `ErrorCode` union plus `NETWORK_ERROR`, which only the
 * frontend client produces (fetch or JSON parsing blew up before we ever saw
 * an error envelope).
 */
const KEY_BY_CODE: Record<string, ErrorMessageKey | undefined> = {
  NETWORK_ERROR: 'errors.network',
  NOT_FOUND: 'errors.notFound',
  RATE_LIMITED: 'errors.rateLimited',
  SUBSCRIPTION_EXISTS: 'errors.subscriptionExists',
  SUBSCRIPTION_REQUIRED: 'errors.subscriptionRequired',
  UPSTREAM_ERROR: 'errors.upstream',
  UPSTREAM_TIMEOUT: 'errors.upstream',
  VALIDATION_ERROR: 'errors.validation',
  INTERNAL_ERROR: 'errors.generic',
};

export function errorMessageKey(code: string): ErrorMessageKey {
  return KEY_BY_CODE[code] ?? 'errors.generic';
}

/**
 * Structural check rather than `instanceof ApiClientError` so this also works
 * for errors that crossed the server/client boundary (React error boundaries
 * receive a plain `Error` with the properties copied over).
 */
export function errorMessageKeyFor(error: unknown): ErrorMessageKey {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return errorMessageKey(error.code);
  }
  return 'errors.generic';
}
