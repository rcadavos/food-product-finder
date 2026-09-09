/**
 * `POST /api/webhooks/stripe`.
 *
 * Two properties matter more than anything else here and both are asserted
 * directly rather than inferred: the handler must see the *raw* bytes Stripe
 * signed (a parsed body silently breaks signature verification in production),
 * and it must never answer a signature problem with a 5xx, because Stripe
 * treats that as "retry for the next three days".
 */

import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client';
import { SubscriptionStatus } from '../../src/generated/prisma/enums';
import { DEMO_USER_ID, prismaMock, setDemoUser } from '../helpers/prismaMock';
import {
  makeCheckoutSession,
  makeStripeEvent,
  makeStripeSubscription,
  stripeMock,
} from '../helpers/stripeMock';
import { createTestApp, resetBackendState } from '../helpers/app';

vi.mock('../../src/lib/prisma', async () => {
  const { prismaMock: mock } = await import('../helpers/prismaMock');
  return { prisma: mock, disconnectPrisma: vi.fn() };
});

vi.mock('../../src/lib/stripe', async () => {
  const { stripeMock: mock, STRIPE_LOCALES } = await import('../helpers/stripeMock');
  return { stripe: mock, STRIPE_LOCALES };
});

const WEBHOOK_PATH = '/api/webhooks/stripe';
const SIGNATURE = 't=1800000000,v1=0f1e2d3c4b5a';
const PERIOD_END_UNIX = 1_800_000_000;

interface SubscriptionProjection {
  userId: string;
  stripeCustomerId: string;
  stripePriceId: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

interface UpsertArgs {
  where: { stripeSubscriptionId: string };
  create: SubscriptionProjection & { stripeSubscriptionId: string };
  update: SubscriptionProjection;
}

interface ProcessedEventArgs {
  data: { id: string; type: string };
}

interface ProcessedEventDeleteArgs {
  where: { id: string };
}

function callArg<T>(mock: Mock, index = 0): T {
  const call = mock.mock.calls[index];
  expect(call, `expected call #${index} to have happened`).toBeDefined();
  return call![0] as T;
}

/**
 * superagent re-encodes any non-string body once the content type is JSON,
 * which would ship `{"type":"Buffer","data":[…]}` instead of the bytes. An
 * identity serializer puts the exact payload Stripe signed on the wire; the
 * cast only satisfies superagent's `(obj) => string` signature.
 */
const keepRawBytes = (value: Buffer): string => value as unknown as string;

/** Posts `payload` exactly as Stripe would: JSON bytes, no client-side parsing. */
function postRaw(payload: unknown, headers: Record<string, string> = {}) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  let req = request(createTestApp())
    .post(WEBHOOK_PATH)
    .set('content-type', 'application/json')
    .serialize(keepRawBytes);
  for (const [name, value] of Object.entries(headers)) {
    req = req.set(name, value);
  }
  return req.send(body);
}

function postSigned(payload: unknown) {
  return postRaw(payload, { 'stripe-signature': SIGNATURE });
}

/**
 * Makes `processedStripeEvent.create` behave like the real unique index: the
 * second insert of an id fails with P2002, which is exactly the signal
 * `markProcessed` uses to detect a replay.
 */
function installEventLedger(): Set<string> {
  const seen = new Set<string>();
  prismaMock.processedStripeEvent.create.mockImplementation(async (args: unknown) => {
    const { data } = (args ?? {}) as Partial<ProcessedEventArgs>;
    const id = data?.id ?? '';
    if (seen.has(id)) {
      throw new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`id`)',
        { code: 'P2002', clientVersion: '7.10.0' },
      );
    }
    seen.add(id);
    return { id, type: data?.type ?? '', processedAt: new Date('2026-01-15T10:00:00.000Z') };
  });
  prismaMock.processedStripeEvent.delete.mockImplementation(async (args: unknown) => {
    const { where } = (args ?? {}) as Partial<ProcessedEventDeleteArgs>;
    const id = where?.id ?? '';
    if (!seen.delete(id)) {
      throw new Prisma.PrismaClientKnownRequestError('Record to delete does not exist.', {
        code: 'P2025',
        clientVersion: '7.10.0',
      });
    }
    return { id, type: '', processedAt: new Date('2026-01-15T10:00:00.000Z') };
  });
  return seen;
}

function expectNoWrites(): void {
  expect(prismaMock.processedStripeEvent.create).not.toHaveBeenCalled();
  expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  expect(prismaMock.user.update).not.toHaveBeenCalled();
}

describe('POST /api/webhooks/stripe — signature handling', () => {
  beforeEach(() => {
    resetBackendState();
    installEventLedger();
  });

  it('rejects a request without a stripe-signature header and writes nothing', async () => {
    const response = await postRaw({ id: 'evt_unsigned', type: 'checkout.session.completed' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toMatch(/signature/i);
    expect(stripeMock.webhooks.constructEvent).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('answers 400, never 500, when constructEvent rejects the signature', async () => {
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });

    const response = await postSigned({ id: 'evt_forged', type: 'checkout.session.completed' });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Invalid Stripe signature',
    });
    expectNoWrites();
  });

  it('hands constructEvent the raw request bytes, the signature and the webhook secret', async () => {
    const payload = { id: 'evt_raw', type: 'ping', data: { object: { hello: 'world' } } };
    stripeMock.webhooks.constructEvent.mockReturnValue(makeStripeEvent('evt_raw', 'ping', {}));

    await postSigned(payload).expect(200);

    const [rawBody, signature, secret] = stripeMock.webhooks.constructEvent.mock.calls[0] ?? [];
    expect(Buffer.isBuffer(rawBody)).toBe(true);
    expect((rawBody as Buffer).toString('utf8')).toBe(JSON.stringify(payload));
    expect(signature).toBe(SIGNATURE);
    expect(secret).toBe('whsec_dummy');
  });
});

describe('POST /api/webhooks/stripe — checkout.session.completed', () => {
  beforeEach(() => {
    resetBackendState();
    installEventLedger();
  });

  it('retrieves the subscription named by the session and projects it locally', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent(
        'evt_checkout_1',
        'checkout.session.completed',
        makeCheckoutSession({ subscription: 'sub_from_session' }),
      ),
    );
    stripeMock.subscriptions.retrieve.mockResolvedValue(
      makeStripeSubscription({
        id: 'sub_from_session',
        status: 'active',
        priceId: 'price_monthly',
        itemPeriodEnd: PERIOD_END_UNIX,
      }),
    );

    const response = await postSigned({ id: 'evt_checkout_1' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith('sub_from_session');

    const args = callArg<UpsertArgs>(prismaMock.subscription.upsert);
    expect(args.where).toEqual({ stripeSubscriptionId: 'sub_from_session' });
    expect(args.create).toMatchObject({
      userId: DEMO_USER_ID,
      stripeSubscriptionId: 'sub_from_session',
      stripeCustomerId: 'cus_test_1',
      stripePriceId: 'price_monthly',
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
    });
    expect(args.create.currentPeriodEnd).toEqual(new Date(PERIOD_END_UNIX * 1000));
    expect(args.update.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('stores a trialing checkout as TRIALING rather than ACTIVE', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent('evt_checkout_trial', 'checkout.session.completed', makeCheckoutSession()),
    );
    stripeMock.subscriptions.retrieve.mockResolvedValue(
      makeStripeSubscription({ status: 'trialing' }),
    );

    await postSigned({ id: 'evt_checkout_trial' }).expect(200);

    expect(callArg<UpsertArgs>(prismaMock.subscription.upsert).create.status).toBe(
      SubscriptionStatus.TRIALING,
    );
  });

  it('links the Stripe customer to the user when the user had none', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent(
        'evt_checkout_link',
        'checkout.session.completed',
        makeCheckoutSession({ customer: 'cus_brand_new' }),
      ),
    );
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeStripeSubscription());

    await postSigned({ id: 'evt_checkout_link' }).expect(200);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: DEMO_USER_ID },
      data: { stripeCustomerId: 'cus_brand_new' },
    });
  });

  it('does not overwrite a customer id the user already has', async () => {
    setDemoUser({ stripeCustomerId: 'cus_existing' });
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent(
        'evt_checkout_keep',
        'checkout.session.completed',
        makeCheckoutSession({ customer: 'cus_other' }),
      ),
    );
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeStripeSubscription());

    await postSigned({ id: 'evt_checkout_keep' }).expect(200);

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('acknowledges a session with no subscription without projecting anything', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent(
        'evt_checkout_nosub',
        'checkout.session.completed',
        makeCheckoutSession({ subscription: null, mode: 'payment' }),
      ),
    );

    const response = await postSigned({ id: 'evt_checkout_nosub' });

    expect(response.status).toBe(200);
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/stripe — idempotency', () => {
  beforeEach(() => {
    resetBackendState();
    installEventLedger();
  });

  it('applies the first delivery and reports the replay as a duplicate', async () => {
    const event = makeStripeEvent(
      'evt_replayed',
      'checkout.session.completed',
      makeCheckoutSession(),
    );
    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeStripeSubscription());

    const first = await postSigned({ id: 'evt_replayed' });
    const second = await postSigned({ id: 'evt_replayed' });

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledTimes(1);
  });

  it('still processes a different event id after a duplicate', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeStripeSubscription());
    stripeMock.webhooks.constructEvent
      .mockReturnValueOnce(
        makeStripeEvent('evt_a', 'checkout.session.completed', makeCheckoutSession()),
      )
      .mockReturnValueOnce(
        makeStripeEvent('evt_a', 'checkout.session.completed', makeCheckoutSession()),
      )
      .mockReturnValueOnce(
        makeStripeEvent('evt_b', 'checkout.session.completed', makeCheckoutSession()),
      );

    await postSigned({ id: 'evt_a' }).expect(200);
    await postSigned({ id: 'evt_a' }).expect(200);
    await postSigned({ id: 'evt_b' }).expect(200);

    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/webhooks/stripe — subscription lifecycle', () => {
  beforeEach(() => {
    resetBackendState();
    installEventLedger();
  });

  it('stores CANCELED for customer.subscription.deleted even when the snapshot says active', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent(
        'evt_deleted',
        'customer.subscription.deleted',
        makeStripeSubscription({ id: 'sub_gone', status: 'active', userId: DEMO_USER_ID }),
      ),
    );

    const response = await postSigned({ id: 'evt_deleted' });

    expect(response.status).toBe(200);
    const args = callArg<UpsertArgs>(prismaMock.subscription.upsert);
    expect(args.where).toEqual({ stripeSubscriptionId: 'sub_gone' });
    expect(args.create.status).toBe(SubscriptionStatus.CANCELED);
    expect(args.update.status).toBe(SubscriptionStatus.CANCELED);
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('projects customer.subscription.updated with the status Stripe sent', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent(
        'evt_updated',
        'customer.subscription.updated',
        makeStripeSubscription({
          id: 'sub_updated',
          status: 'past_due',
          cancelAtPeriodEnd: true,
          userId: DEMO_USER_ID,
        }),
      ),
    );

    await postSigned({ id: 'evt_updated' }).expect(200);

    const args = callArg<UpsertArgs>(prismaMock.subscription.upsert);
    expect(args.update.status).toBe(SubscriptionStatus.PAST_DUE);
    expect(args.update.cancelAtPeriodEnd).toBe(true);
  });

  it('resolves the user by stripeCustomerId when the subscription has no metadata', async () => {
    setDemoUser({ stripeCustomerId: 'cus_linked' });
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent(
        'evt_by_customer',
        'customer.subscription.updated',
        makeStripeSubscription({ id: 'sub_by_cus', customer: 'cus_linked', userId: null }),
      ),
    );

    await postSigned({ id: 'evt_by_customer' }).expect(200);

    expect(callArg<UpsertArgs>(prismaMock.subscription.upsert).create.userId).toBe(DEMO_USER_ID);
  });

  it('acknowledges an unhandled event type without touching the projection', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent('evt_unhandled', 'payment_intent.succeeded', { id: 'pi_1' }),
    );

    const response = await postSigned({ id: 'evt_unhandled' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/stripe — unresolvable user', () => {
  beforeEach(() => {
    resetBackendState();
    installEventLedger();
  });

  it('acknowledges a checkout session for an unknown user so Stripe stops retrying', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent(
        'evt_orphan_checkout',
        'checkout.session.completed',
        makeCheckoutSession({
          client_reference_id: 'usr_not_in_this_database',
          customer: 'cus_unknown',
        }),
      ),
    );

    const response = await postSigned({ id: 'evt_orphan_checkout' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('acknowledges a subscription event for an unknown customer without projecting it', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent(
        'evt_orphan_sub',
        'customer.subscription.updated',
        makeStripeSubscription({
          id: 'sub_orphan',
          customer: 'cus_nobody',
          userId: 'usr_not_in_this_database',
        }),
      ),
    );

    const response = await postSigned({ id: 'evt_orphan_sub' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/stripe — a side effect that fails', () => {
  let ledger: Set<string>;

  beforeEach(() => {
    resetBackendState();
    ledger = installEventLedger();
  });

  /**
   * The claim on an event id is taken before the handler runs. If it outlived a
   * failed handler, Stripe's retry would be answered `duplicate` and the
   * subscription change would be lost with nothing left to repair it — so the
   * important assertion is not the 500, it is that the redelivery still lands.
   */
  it('releases the claim so the redelivery is applied rather than skipped as a replay', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent(
        'evt_transient',
        'checkout.session.completed',
        makeCheckoutSession({ subscription: 'sub_retried' }),
      ),
    );
    stripeMock.subscriptions.retrieve
      .mockRejectedValueOnce(new Error('Stripe is temporarily unavailable'))
      .mockResolvedValue(makeStripeSubscription({ id: 'sub_retried' }));

    const failed = await postSigned({ id: 'evt_transient' });

    expect(failed.status).toBe(500);
    expect(prismaMock.processedStripeEvent.delete).toHaveBeenCalledWith({
      where: { id: 'evt_transient' },
    });
    expect(ledger.has('evt_transient')).toBe(false);
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();

    const retried = await postSigned({ id: 'evt_transient' });

    expect(retried.status).toBe(200);
    expect(retried.body).toEqual({ received: true });
    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(callArg<UpsertArgs>(prismaMock.subscription.upsert).where).toEqual({
      stripeSubscriptionId: 'sub_retried',
    });
  });

  it('leaves the claim released when the projection write is what failed', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent(
        'evt_deadlock',
        'customer.subscription.updated',
        makeStripeSubscription({ id: 'sub_deadlocked', userId: DEMO_USER_ID }),
      ),
    );
    prismaMock.subscription.upsert.mockRejectedValueOnce(new Error('Deadlock found'));

    const failed = await postSigned({ id: 'evt_deadlock' });

    expect(failed.status).toBe(500);
    expect(failed.body.error.code).toBe('INTERNAL_ERROR');
    expect(ledger.has('evt_deadlock')).toBe(false);
  });

  it('reports the original failure even when releasing the claim also fails', async () => {
    prismaMock.processedStripeEvent.delete.mockRejectedValue(new Error('connection reset'));
    stripeMock.webhooks.constructEvent.mockReturnValue(
      makeStripeEvent('evt_double_fault', 'checkout.session.completed', makeCheckoutSession()),
    );
    stripeMock.subscriptions.retrieve.mockRejectedValue(new Error('Stripe is down'));

    const response = await postSigned({ id: 'evt_double_fault' });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });
});
