/**
 * `/api/billing` — Stripe Checkout and Billing Portal session creation.
 *
 * The Stripe SDK is replaced wholesale, so every assertion here is about what
 * the route *asks* Stripe to do (customer reuse, locale-carrying return URLs,
 * the client reference that lets the webhook find the user again) and how it
 * behaves when Stripe says no.
 */

import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { env } from '../../src/config/env';
import { DEMO_USER_ID, giveActiveSubscription, prismaMock, setDemoUser } from '../helpers/prismaMock';
import { makeStripeSubscription, stripeMock } from '../helpers/stripeMock';
import { createTestApp, resetBackendState } from '../helpers/app';

vi.mock('../../src/lib/prisma', async () => {
  const { prismaMock: mock } = await import('../helpers/prismaMock');
  return { prisma: mock, disconnectPrisma: vi.fn() };
});

vi.mock('../../src/lib/stripe', async () => {
  const { stripeMock: mock, STRIPE_LOCALES } = await import('../helpers/stripeMock');
  return { stripe: mock, STRIPE_LOCALES };
});

interface CheckoutParams {
  mode: string;
  customer: string;
  line_items: Array<{ price: string; quantity: number }>;
  success_url: string;
  cancel_url: string;
  client_reference_id: string;
  locale: string;
  subscription_data: { metadata: { userId: string } };
  allow_promotion_codes: boolean;
}

interface CustomerParams {
  email: string;
  name?: string;
  metadata: { userId: string };
}

interface PortalParams {
  customer: string;
  return_url: string;
}

interface UserUpdateArgs {
  where: { id: string };
  data: { stripeCustomerId?: string };
}

function callArg<T>(mock: Mock, index = 0): T {
  const call = mock.mock.calls[index];
  expect(call, `expected call #${index} to have happened`).toBeDefined();
  return call![0] as T;
}

describe('POST /api/billing/checkout-session', () => {
  beforeEach(() => {
    resetBackendState();
  });

  it('creates a Stripe customer for a user that has none and persists the id', async () => {
    const response = await request(createTestApp())
      .post('/api/billing/checkout-session')
      .send({ locale: 'en' });

    expect(response.status).toBe(200);
    expect(stripeMock.customers.create).toHaveBeenCalledTimes(1);
    expect(callArg<CustomerParams>(stripeMock.customers.create)).toEqual({
      email: env.DEMO_USER_EMAIL,
      name: env.DEMO_USER_NAME,
      metadata: { userId: DEMO_USER_ID },
    });
    expect(callArg<UserUpdateArgs>(prismaMock.user.update)).toEqual({
      where: { id: DEMO_USER_ID },
      data: { stripeCustomerId: 'cus_test_new' },
    });
  });

  it('returns the Stripe-hosted checkout url and session id', async () => {
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_abc',
      url: 'https://checkout.stripe.test/c/pay/cs_test_abc',
    });

    const response = await request(createTestApp())
      .post('/api/billing/checkout-session')
      .send({ locale: 'en' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      url: 'https://checkout.stripe.test/c/pay/cs_test_abc',
      sessionId: 'cs_test_abc',
    });
  });

  it('reuses a stored stripeCustomerId instead of creating a second customer', async () => {
    setDemoUser({ stripeCustomerId: 'cus_already_there' });

    await request(createTestApp())
      .post('/api/billing/checkout-session')
      .send({ locale: 'en' })
      .expect(200);

    expect(stripeMock.customers.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(callArg<CheckoutParams>(stripeMock.checkout.sessions.create).customer).toBe(
      'cus_already_there',
    );
  });

  it('creates the customer only on the first of two consecutive checkouts', async () => {
    const agent = request(createTestApp());

    await agent.post('/api/billing/checkout-session').send({ locale: 'en' }).expect(200);
    await agent.post('/api/billing/checkout-session').send({ locale: 'en' }).expect(200);

    expect(stripeMock.customers.create).toHaveBeenCalledTimes(1);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(2);
    expect(callArg<CheckoutParams>(stripeMock.checkout.sessions.create, 1).customer).toBe(
      'cus_test_new',
    );
  });

  it('carries the requested locale into the return urls and the Checkout locale', async () => {
    await request(createTestApp())
      .post('/api/billing/checkout-session')
      .send({ locale: 'fr' })
      .expect(200);

    const params = callArg<CheckoutParams>(stripeMock.checkout.sessions.create);
    expect(params.success_url).toBe(
      `${env.FRONTEND_URL}/fr/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(params.cancel_url).toBe(`${env.FRONTEND_URL}/fr/billing/cancel`);
    expect(params.locale).toBe('fr');
  });

  it('falls back to English return urls when the body carries no locale', async () => {
    await request(createTestApp()).post('/api/billing/checkout-session').expect(200);

    const params = callArg<CheckoutParams>(stripeMock.checkout.sessions.create);
    expect(params.success_url).toContain(`${env.FRONTEND_URL}/en/billing/success`);
    expect(params.cancel_url).toBe(`${env.FRONTEND_URL}/en/billing/cancel`);
  });

  it('identifies the local user through client_reference_id and subscription metadata', async () => {
    await request(createTestApp())
      .post('/api/billing/checkout-session')
      .send({ locale: 'de' })
      .expect(200);

    const params = callArg<CheckoutParams>(stripeMock.checkout.sessions.create);
    expect(params.client_reference_id).toBe(DEMO_USER_ID);
    expect(params.subscription_data.metadata.userId).toBe(DEMO_USER_ID);
  });

  it('asks for one unit of the configured recurring price in subscription mode', async () => {
    await request(createTestApp()).post('/api/billing/checkout-session').expect(200);

    const params = callArg<CheckoutParams>(stripeMock.checkout.sessions.create);
    expect(params.mode).toBe('subscription');
    expect(params.line_items).toEqual([{ price: env.STRIPE_PRICE_ID, quantity: 1 }]);
  });

  it('rejects an unsupported locale with 400 VALIDATION_ERROR before calling Stripe', async () => {
    const response = await request(createTestApp())
      .post('/api/billing/checkout-session')
      .send({ locale: 'es' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('turns a Checkout SDK failure into 502 UPSTREAM_ERROR without echoing Stripe’s message', async () => {
    stripeMock.checkout.sessions.create.mockRejectedValue(
      new Error('No such price: price_dummy; a similar object exists in live mode'),
    );

    const response = await request(createTestApp())
      .post('/api/billing/checkout-session')
      .send({ locale: 'en' });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('UPSTREAM_ERROR');
    expect(response.body.error.message).toBe('Stripe request failed');
    expect(response.body.error.message).not.toContain('live mode');
  });

  it('turns a customer-creation failure into 502 and persists no customer id', async () => {
    stripeMock.customers.create.mockRejectedValue(new Error('Invalid API Key provided: sk_test_***'));

    const response = await request(createTestApp()).post('/api/billing/checkout-session');

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('UPSTREAM_ERROR');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('reports 500 INTERNAL_ERROR when Stripe returns a session without a url', async () => {
    stripeMock.checkout.sessions.create.mockResolvedValue({ id: 'cs_test_nourl', url: null });

    const response = await request(createTestApp()).post('/api/billing/checkout-session');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('POST /api/billing/portal-session', () => {
  beforeEach(() => {
    resetBackendState();
  });

  it('rejects a user who has never been to checkout with 400 VALIDATION_ERROR', async () => {
    const response = await request(createTestApp())
      .post('/api/billing/portal-session')
      .send({ locale: 'en' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toMatch(/subscribe first/i);
    expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
    expect(stripeMock.customers.create).not.toHaveBeenCalled();
  });

  it('returns the portal url for a user with a stored customer id', async () => {
    setDemoUser({ stripeCustomerId: 'cus_portal_1' });
    stripeMock.billingPortal.sessions.create.mockResolvedValue({
      id: 'bps_1',
      url: 'https://billing.stripe.test/p/session/bps_1',
    });

    const response = await request(createTestApp())
      .post('/api/billing/portal-session')
      .send({ locale: 'nl' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ url: 'https://billing.stripe.test/p/session/bps_1' });
  });

  it('sends the customer back to the locale-prefixed home page', async () => {
    setDemoUser({ stripeCustomerId: 'cus_portal_2' });

    await request(createTestApp())
      .post('/api/billing/portal-session')
      .send({ locale: 'nl' })
      .expect(200);

    expect(callArg<PortalParams>(stripeMock.billingPortal.sessions.create)).toEqual({
      customer: 'cus_portal_2',
      return_url: `${env.FRONTEND_URL}/nl`,
    });
  });

  it('turns a Billing Portal SDK failure into 502 UPSTREAM_ERROR', async () => {
    setDemoUser({ stripeCustomerId: 'cus_portal_3' });
    stripeMock.billingPortal.sessions.create.mockRejectedValue(
      new Error('No configuration provided for the customer portal'),
    );

    const response = await request(createTestApp()).post('/api/billing/portal-session');

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('UPSTREAM_ERROR');
    expect(response.body.error.message).toBe('Stripe request failed');
  });
});

describe('duplicate subscription guard', () => {
  beforeEach(() => {
    resetBackendState();
  });

  it('refuses a second checkout when the projection already shows an active subscription', async () => {
    setDemoUser({ stripeCustomerId: 'cus_dup_1' });
    giveActiveSubscription({ stripeSubscriptionId: 'sub_already_active' });

    const response = await request(createTestApp()).post('/api/billing/checkout-session');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SUBSCRIPTION_EXISTS');
    // The point of the guard: Stripe is never asked to open a second checkout.
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    // The local row was enough, so Stripe was not consulted at all.
    expect(stripeMock.subscriptions.list).not.toHaveBeenCalled();
  });

  it('refuses a second checkout when only Stripe knows about the subscription', async () => {
    // The exact hole a missed webhook opens: the projection is empty, but the
    // customer is already paying.
    setDemoUser({ stripeCustomerId: 'cus_dup_2' });
    prismaMock.subscription.findMany.mockResolvedValue([]);
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [makeStripeSubscription({ id: 'sub_live_only', customer: 'cus_dup_2', status: 'active' })],
    });

    const response = await request(createTestApp()).post('/api/billing/checkout-session');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SUBSCRIPTION_EXISTS');
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('repairs the stale projection when Stripe reports a subscription the database missed', async () => {
    setDemoUser({ stripeCustomerId: 'cus_dup_3' });
    prismaMock.subscription.findMany.mockResolvedValue([]);
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [makeStripeSubscription({ id: 'sub_repaired', customer: 'cus_dup_3', status: 'active' })],
    });

    await request(createTestApp()).post('/api/billing/checkout-session');

    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(1);
    const args = prismaMock.subscription.upsert.mock.calls[0]?.[0] as {
      where: { stripeSubscriptionId: string };
      create: { status: string; userId: string };
    };
    expect(args.where.stripeSubscriptionId).toBe('sub_repaired');
    expect(args.create.status).toBe('ACTIVE');
    expect(args.create.userId).toBe(DEMO_USER_ID);
  });

  it('still opens checkout when neither the database nor Stripe has a live subscription', async () => {
    setDemoUser({ stripeCustomerId: 'cus_dup_4' });
    prismaMock.subscription.findMany.mockResolvedValue([]);
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });

    const response = await request(createTestApp()).post('/api/billing/checkout-session');

    expect(response.status).toBe(200);
    expect(response.body.url).toBe('https://checkout.stripe.test/c/pay/cs_test_123');
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it('ignores a cancelled Stripe subscription so the user can resubscribe', async () => {
    setDemoUser({ stripeCustomerId: 'cus_dup_5' });
    prismaMock.subscription.findMany.mockResolvedValue([]);
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [
        makeStripeSubscription({ id: 'sub_gone', customer: 'cus_dup_5', status: 'canceled' }),
        makeStripeSubscription({ id: 'sub_dead', customer: 'cus_dup_5', status: 'incomplete_expired' }),
      ],
    });

    const response = await request(createTestApp()).post('/api/billing/checkout-session');

    expect(response.status).toBe(200);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/billing/confirm', () => {
  beforeEach(() => {
    resetBackendState();
  });

  it('reconciles the subscription straight from the checkout session', async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_confirm_1',
      client_reference_id: DEMO_USER_ID,
      subscription: 'sub_confirm_1',
    });
    stripeMock.subscriptions.retrieve.mockResolvedValue(
      makeStripeSubscription({ id: 'sub_confirm_1', status: 'active' }),
    );

    const response = await request(createTestApp())
      .post('/api/billing/confirm')
      .send({ sessionId: 'cs_confirm_1' });

    expect(response.status).toBe(200);
    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(1);
    const args = prismaMock.subscription.upsert.mock.calls[0]?.[0] as {
      where: { stripeSubscriptionId: string };
      create: { status: string };
    };
    expect(args.where.stripeSubscriptionId).toBe('sub_confirm_1');
    expect(args.create.status).toBe('ACTIVE');
  });

  it('refuses a session belonging to another user without touching the database', async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_someone_else',
      client_reference_id: 'usr_not_the_demo_user',
      subscription: 'sub_someone_else',
    });

    const response = await request(createTestApp())
      .post('/api/billing/confirm')
      .send({ sessionId: 'cs_someone_else' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('rejects a request with no session id', async () => {
    const response = await request(createTestApp()).post('/api/billing/confirm').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(stripeMock.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });

  it('succeeds without writing anything when the session carries no subscription', async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_no_sub',
      client_reference_id: DEMO_USER_ID,
      subscription: null,
    });

    const response = await request(createTestApp())
      .post('/api/billing/confirm')
      .send({ sessionId: 'cs_no_sub' });

    expect(response.status).toBe(200);
    expect(response.body.subscription.status).toBe('none');
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe('checkout return urls', () => {
  beforeEach(() => {
    resetBackendState();
  });

  it('sends the user back to the page they subscribed from', async () => {
    await request(createTestApp())
      .post('/api/billing/checkout-session')
      .send({ locale: 'nl', returnPath: '/product/3017620422003' });

    const params = callArg<CheckoutParams>(stripeMock.checkout.sessions.create);
    expect(params.success_url).toBe(
      `${env.FRONTEND_URL}/nl/billing/success?session_id={CHECKOUT_SESSION_ID}&next=%2Fproduct%2F3017620422003`,
    );
    // Cancelling should not detour through the billing page at all.
    expect(params.cancel_url).toBe(`${env.FRONTEND_URL}/nl/product/3017620422003`);
  });

  it('falls back to the billing pages when no return path is given', async () => {
    await request(createTestApp()).post('/api/billing/checkout-session').send({ locale: 'en' });

    const params = callArg<CheckoutParams>(stripeMock.checkout.sessions.create);
    expect(params.success_url).toBe(
      `${env.FRONTEND_URL}/en/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(params.cancel_url).toBe(`${env.FRONTEND_URL}/en/billing/cancel`);
  });

  it.each([
    ['an absolute url', 'https://evil.test/steal'],
    ['a protocol-relative url', '//evil.test/steal'],
    ['a backslash-prefixed path', '/\\evil.test'],
    ['a path that does not start with a slash', 'product/123'],
  ])('rejects %s as a return path before calling Stripe', async (_label, returnPath) => {
    const response = await request(createTestApp())
      .post('/api/billing/checkout-session')
      .send({ locale: 'en', returnPath });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
