export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'SUBSCRIPTION_REQUIRED'
  | 'SUBSCRIPTION_EXISTS'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_TIMEOUT'
  | 'INTERNAL_ERROR';

/**
 * Every error that is safe to show a client. Anything else reaching the error
 * middleware is reported as a generic 500.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, HttpError);
  }
}

export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError;
}

export function badRequest(message = 'The request was not valid.', details?: unknown): HttpError {
  return new HttpError(400, 'VALIDATION_ERROR', message, details);
}

export function notFound(message = 'The requested resource does not exist.', details?: unknown): HttpError {
  return new HttpError(404, 'NOT_FOUND', message, details);
}

export function subscriptionRequired(
  message = 'An active subscription is required for this resource.',
  details?: unknown,
): HttpError {
  return new HttpError(402, 'SUBSCRIPTION_REQUIRED', message, details);
}

export function subscriptionExists(
  message = 'This user already has an active subscription.',
  details?: unknown,
): HttpError {
  return new HttpError(409, 'SUBSCRIPTION_EXISTS', message, details);
}

export function rateLimited(message = 'Too many requests, please retry shortly.', details?: unknown): HttpError {
  return new HttpError(429, 'RATE_LIMITED', message, details);
}

export function upstream(message = 'An upstream service failed.', details?: unknown): HttpError {
  return new HttpError(502, 'UPSTREAM_ERROR', message, details);
}

export function upstreamTimeout(message = 'An upstream service timed out.', details?: unknown): HttpError {
  return new HttpError(504, 'UPSTREAM_TIMEOUT', message, details);
}

export function internal(message = 'Something went wrong.', details?: unknown): HttpError {
  return new HttpError(500, 'INTERNAL_ERROR', message, details);
}
