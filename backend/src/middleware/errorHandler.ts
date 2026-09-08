import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, flattenError } from 'zod';
import { HttpError, isHttpError, type ErrorCode } from '../lib/httpError';
import { logger } from '../lib/logger';

interface ErrorEnvelope {
  error: { code: ErrorCode; message: string; details?: unknown };
}

function envelope(code: ErrorCode, message: string, details?: unknown): ErrorEnvelope {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json(envelope('NOT_FOUND', `Cannot ${req.method} ${req.path} — no such endpoint.`));
};

/**
 * `express.json()` and `express.raw()` reject a malformed or oversized body with
 * an `http-errors` object rather than an `HttpError`. It carries `expose: true`
 * precisely because the fault is the caller's, so answering it as a 500 both
 * misreports it and lets an anonymous caller fill the error log with stack
 * traces. Returns the status to answer with, or `null` when this is not one.
 */
function exposedClientErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('expose' in error)) {
    return null;
  }
  if (error.expose !== true) {
    return null;
  }
  const raw: unknown =
    'status' in error ? error.status : 'statusCode' in error ? error.statusCode : undefined;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return null;
  }
  return raw >= 400 && raw <= 499 ? raw : null;
}

function classify(error: unknown): { status: number; body: ErrorEnvelope } {
  if (isHttpError(error)) {
    return { status: error.status, body: envelope(error.code, error.message, error.details) };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: envelope('VALIDATION_ERROR', 'The request was not valid.', flattenError(error)),
    };
  }
  const clientStatus = exposedClientErrorStatus(error);
  if (clientStatus !== null) {
    // Neither the parser's message nor its stack goes back on the wire: the
    // caller only needs to know their own request could not be read.
    return {
      status: clientStatus,
      body: envelope('VALIDATION_ERROR', 'The request body could not be read.'),
    };
  }
  // Anything unrecognised is a bug on our side: report it generically and keep
  // the stack in the log, never in the response.
  return { status: 500, body: envelope('INTERNAL_ERROR', 'Something went wrong.') };
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  // Streaming already started; only Express can still tear the response down.
  if (res.headersSent) {
    next(error);
    return;
  }

  const { status, body } = classify(error);
  const meta = {
    method: req.method,
    path: req.originalUrl,
    status,
    code: body.error.code,
    error: error instanceof Error ? error : { message: String(error) },
  };

  if (status >= 500) {
    logger.error(body.error.message, meta);
  } else if (error instanceof HttpError || error instanceof ZodError) {
    logger.debug('Request rejected', meta);
  } else {
    logger.warn('Request failed', meta);
  }

  res.status(status).json(body);
};
