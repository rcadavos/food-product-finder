/**
 * How the app answers a body it cannot read.
 *
 * `express.json()` and `express.raw()` reject those with an `http-errors`
 * object, which is neither an `HttpError` nor a `ZodError`. Before the error
 * middleware learned to recognise it, a truncated payload was reported to the
 * caller as a 500 and written to the error log with a full stack — on the
 * webhook route, by any anonymous caller, as often as they liked.
 */

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, resetBackendState } from '../helpers/app';
import { prismaMock } from '../helpers/prismaMock';
import { makeStripeEvent, stripeMock } from '../helpers/stripeMock';

vi.mock('../../src/lib/prisma', async () => {
  const { prismaMock: mock } = await import('../helpers/prismaMock');
  return { prisma: mock, disconnectPrisma: vi.fn() };
});

vi.mock('../../src/lib/stripe', async () => {
  const { stripeMock: mock, STRIPE_LOCALES } = await import('../helpers/stripeMock');
  return { stripe: mock, STRIPE_LOCALES };
});

/** superagent only re-serialises objects, so a raw string goes out untouched. */
function postBody(path: string, body: string) {
  return request(createTestApp()).post(path).set('content-type', 'application/json').send(body);
}

describe('a request body the parser rejects', () => {
  beforeEach(() => {
    resetBackendState();
  });

  it('answers malformed JSON with 400 VALIDATION_ERROR instead of 500', async () => {
    const response = await postBody('/api/billing/checkout-session', '{"locale": "en"');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('leaks neither the parser message nor a stack trace to the caller', async () => {
    const response = await postBody('/api/billing/checkout-session', 'definitely not json');

    expect(response.status).toBe(400);
    expect(response.body.error.details).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/JSON|token|at .+:\d+:\d+/);
  });

  it('rejects a webhook body over the raw limit with 413, not 500', async () => {
    const oversized = `{"padding":"${'x'.repeat(1_200_000)}"}`;

    const response = await postBody('/api/webhooks/stripe', oversized).set(
      'stripe-signature',
      't=1800000000,v1=0f1e2d3c4b5a',
    );

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(stripeMock.webhooks.constructEvent).not.toHaveBeenCalled();
    expect(prismaMock.processedStripeEvent.create).not.toHaveBeenCalled();
  });

  /**
   * The webhook cap is set deliberately to 1 MB; body-parser's own default is
   * 100 kB, which a padded but perfectly legitimate Stripe event could exceed.
   */
  it('accepts a webhook body between the parser default and the configured limit', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent('evt_padded', 'payment_intent.succeeded', { id: 'pi_1' }),
    );
    const padded = `{"padding":"${'x'.repeat(300_000)}"}`;

    const response = await postBody('/api/webhooks/stripe', padded).set(
      'stripe-signature',
      't=1800000000,v1=0f1e2d3c4b5a',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    expect(stripeMock.webhooks.constructEvent).toHaveBeenCalledTimes(1);
  });

  it('still accepts a well-formed body on the same route', async () => {
    const response = await postBody('/api/billing/checkout-session', '{"locale":"nl"}');

    expect(response.status).toBe(200);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });
});
