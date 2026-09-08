import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client';
import { SubscriptionStatus } from '../../src/generated/prisma/enums';
// Imported before the module under test so the `vi.mock` factory below can hand
// out `prismaMock` when `subscriptionService` pulls in `src/lib/prisma`.
import { DEMO_USER_ID, makeSubscription, prismaMock, resetPrismaMock } from '../helpers/prismaMock';
import { makeStripeSubscription } from '../helpers/stripeMock';
import {
  getActiveSubscription,
  getEntitlements,
  getSubscriptionSummary,
  markProcessed,
  upsertFromStripeSubscription,
} from '../../src/services/subscriptionService';

vi.mock('../../src/lib/prisma', () => ({
  prisma: prismaMock,
  disconnectPrisma: vi.fn(),
}));

const NOW = new Date('2026-03-01T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
const PAST = new Date(NOW.getTime() - HOUR_MS);
const FUTURE = new Date(NOW.getTime() + 30 * 24 * HOUR_MS);

const ITEM_PERIOD_END_SECONDS = 1_800_000_000;
const ROOT_PERIOD_END_SECONDS = 1_700_000_000;

function knownRequestError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Prisma failed with ${code}`, {
    code,
    clientVersion: '7.10.0',
  });
}

/** A subscription whose customer arrived expanded rather than as a bare id. */
function withExpandedCustomer(customerId: string): Stripe.Subscription {
  const base = makeStripeSubscription({ id: 'sub_expanded' });
  return {
    ...base,
    customer: { id: customerId, object: 'customer' },
  } as unknown as Stripe.Subscription;
}

function withoutItems(): Stripe.Subscription {
  return {
    id: 'sub_no_items',
    object: 'subscription',
    customer: 'cus_test_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: {},
    items: { object: 'list', data: [] },
  } as unknown as Stripe.Subscription;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetPrismaMock();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getActiveSubscription', () => {
  it('reads the user rows newest first', async () => {
    await getActiveSubscription(DEMO_USER_ID);

    expect(prismaMock.subscription.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.subscription.findMany).toHaveBeenCalledWith({
      where: { userId: DEMO_USER_ID },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns null when the user has no subscription rows', async () => {
    await expect(getActiveSubscription(DEMO_USER_ID)).resolves.toBeNull();
  });

  it('ignores canceled and past-due rows', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      makeSubscription({ id: 'row_canceled', status: SubscriptionStatus.CANCELED }),
      makeSubscription({ id: 'row_past_due', status: SubscriptionStatus.PAST_DUE }),
    ]);

    await expect(getActiveSubscription(DEMO_USER_ID)).resolves.toBeNull();
  });

  it('ignores an active row whose billing period has already ended', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      makeSubscription({
        id: 'row_expired',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: PAST,
      }),
    ]);

    await expect(getActiveSubscription(DEMO_USER_ID)).resolves.toBeNull();
  });

  it('accepts a trialing row', async () => {
    const trialing = makeSubscription({
      id: 'row_trialing',
      status: SubscriptionStatus.TRIALING,
      currentPeriodEnd: FUTURE,
    });
    prismaMock.subscription.findMany.mockResolvedValue([trialing]);

    await expect(getActiveSubscription(DEMO_USER_ID)).resolves.toBe(trialing);
  });

  it('accepts an active row that has no period end yet', async () => {
    const openEnded = makeSubscription({ id: 'row_open', currentPeriodEnd: null });
    prismaMock.subscription.findMany.mockResolvedValue([openEnded]);

    await expect(getActiveSubscription(DEMO_USER_ID)).resolves.toBe(openEnded);
  });

  it('picks the newest entitling row when an unusable newer row precedes it', async () => {
    const usable = makeSubscription({ id: 'row_usable', currentPeriodEnd: FUTURE });
    prismaMock.subscription.findMany.mockResolvedValue([
      makeSubscription({
        id: 'row_expired',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: PAST,
      }),
      usable,
    ]);

    await expect(getActiveSubscription(DEMO_USER_ID)).resolves.toBe(usable);
  });
});

describe('getEntitlements', () => {
  it('grants nutrition access while an active row is valid', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      makeSubscription({ currentPeriodEnd: FUTURE }),
    ]);

    await expect(getEntitlements(DEMO_USER_ID)).resolves.toEqual({ nutrition: true });
  });

  it('grants nutrition access during a trial', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      makeSubscription({ status: SubscriptionStatus.TRIALING, currentPeriodEnd: null }),
    ]);

    await expect(getEntitlements(DEMO_USER_ID)).resolves.toEqual({ nutrition: true });
  });

  it('withholds nutrition access when the user has never subscribed', async () => {
    await expect(getEntitlements(DEMO_USER_ID)).resolves.toEqual({ nutrition: false });
  });

  it('withholds nutrition access once the subscription has been canceled', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      makeSubscription({ status: SubscriptionStatus.CANCELED, currentPeriodEnd: FUTURE }),
    ]);

    await expect(getEntitlements(DEMO_USER_ID)).resolves.toEqual({ nutrition: false });
  });

  it('withholds nutrition access when the paid period has lapsed', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      makeSubscription({ currentPeriodEnd: PAST }),
    ]);

    await expect(getEntitlements(DEMO_USER_ID)).resolves.toEqual({ nutrition: false });
  });
});

describe('getSubscriptionSummary', () => {
  it("reports status 'none' when the user has no subscription rows", async () => {
    await expect(getSubscriptionSummary(DEMO_USER_ID)).resolves.toEqual({
      status: 'none',
      active: false,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  });

  it('reports the active row with an ISO period end', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      makeSubscription({ currentPeriodEnd: FUTURE, cancelAtPeriodEnd: true }),
    ]);

    await expect(getSubscriptionSummary(DEMO_USER_ID)).resolves.toEqual({
      status: 'active',
      active: true,
      currentPeriodEnd: FUTURE.toISOString(),
      cancelAtPeriodEnd: true,
    });
  });

  it('reports the newest row when none of them entitles the user', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      makeSubscription({
        id: 'row_past_due',
        status: SubscriptionStatus.PAST_DUE,
        currentPeriodEnd: PAST,
        cancelAtPeriodEnd: false,
      }),
      makeSubscription({ id: 'row_older', status: SubscriptionStatus.CANCELED }),
    ]);

    await expect(getSubscriptionSummary(DEMO_USER_ID)).resolves.toEqual({
      status: 'past_due',
      active: false,
      currentPeriodEnd: PAST.toISOString(),
      cancelAtPeriodEnd: false,
    });
  });

  it('prefers an older entitling row over a newer dead one', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      makeSubscription({ id: 'row_incomplete', status: SubscriptionStatus.INCOMPLETE }),
      makeSubscription({
        id: 'row_trialing',
        status: SubscriptionStatus.TRIALING,
        currentPeriodEnd: FUTURE,
      }),
    ]);

    await expect(getSubscriptionSummary(DEMO_USER_ID)).resolves.toEqual({
      status: 'trialing',
      active: true,
      currentPeriodEnd: FUTURE.toISOString(),
      cancelAtPeriodEnd: false,
    });
  });

  it('reports a null period end without inventing a date', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      makeSubscription({ status: SubscriptionStatus.UNPAID, currentPeriodEnd: null }),
    ]);

    await expect(getSubscriptionSummary(DEMO_USER_ID)).resolves.toEqual({
      status: 'unpaid',
      active: false,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  });
});

describe('markProcessed', () => {
  it('records an unseen event id and reports it as the first sighting', async () => {
    await expect(markProcessed('evt_1', 'checkout.session.completed')).resolves.toBe(true);

    expect(prismaMock.processedStripeEvent.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.processedStripeEvent.create).toHaveBeenCalledWith({
      data: { id: 'evt_1', type: 'checkout.session.completed' },
    });
  });

  it('reports a replay when Prisma raises a P2002 unique-constraint error', async () => {
    prismaMock.processedStripeEvent.create.mockRejectedValue(knownRequestError('P2002'));

    await expect(markProcessed('evt_1', 'checkout.session.completed')).resolves.toBe(false);
  });

  it('reports a replay for a P2002 error that arrives from another module instance', async () => {
    prismaMock.processedStripeEvent.create.mockRejectedValue({
      code: 'P2002',
      message: 'Unique constraint failed on the fields: (`id`)',
    });

    await expect(markProcessed('evt_1', 'customer.subscription.updated')).resolves.toBe(false);
  });

  it('rethrows a Prisma error that is not a duplicate', async () => {
    const failure = knownRequestError('P2003');
    prismaMock.processedStripeEvent.create.mockRejectedValue(failure);

    await expect(markProcessed('evt_2', 'invoice.payment_failed')).rejects.toBe(failure);
  });

  it('rethrows an unrelated failure so the webhook is retried', async () => {
    const failure = new Error('connection reset');
    prismaMock.processedStripeEvent.create.mockRejectedValue(failure);

    await expect(markProcessed('evt_3', 'customer.subscription.deleted')).rejects.toBe(failure);
  });
});

describe('upsertFromStripeSubscription', () => {
  it('upserts on the Stripe subscription id with the full projection', async () => {
    await upsertFromStripeSubscription(DEMO_USER_ID, makeStripeSubscription());

    const data = {
      userId: DEMO_USER_ID,
      stripeCustomerId: 'cus_test_1',
      stripePriceId: 'price_dummy',
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date(ITEM_PERIOD_END_SECONDS * 1000),
      cancelAtPeriodEnd: false,
    };

    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_stripe_1' },
      create: { stripeSubscriptionId: 'sub_stripe_1', ...data },
      update: data,
    });
  });

  it('takes the period end from the first subscription item', async () => {
    await upsertFromStripeSubscription(
      DEMO_USER_ID,
      makeStripeSubscription({ itemPeriodEnd: ITEM_PERIOD_END_SECONDS, rootPeriodEnd: null }),
    );

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          currentPeriodEnd: new Date(ITEM_PERIOD_END_SECONDS * 1000),
        }),
      }),
    );
  });

  it('prefers the item period end over a root-level one', async () => {
    await upsertFromStripeSubscription(
      DEMO_USER_ID,
      makeStripeSubscription({
        itemPeriodEnd: ITEM_PERIOD_END_SECONDS,
        rootPeriodEnd: ROOT_PERIOD_END_SECONDS,
      }),
    );

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          currentPeriodEnd: new Date(ITEM_PERIOD_END_SECONDS * 1000),
        }),
      }),
    );
  });

  it('falls back to the root-level period end from older API versions', async () => {
    await upsertFromStripeSubscription(
      DEMO_USER_ID,
      makeStripeSubscription({ itemPeriodEnd: null, rootPeriodEnd: ROOT_PERIOD_END_SECONDS }),
    );

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          currentPeriodEnd: new Date(ROOT_PERIOD_END_SECONDS * 1000),
        }),
      }),
    );
  });

  it('stores a null period end when Stripe reports one nowhere', async () => {
    await upsertFromStripeSubscription(
      DEMO_USER_ID,
      makeStripeSubscription({ itemPeriodEnd: null, rootPeriodEnd: null }),
    );

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ currentPeriodEnd: null }),
      }),
    );
  });

  it.each([
    ['trialing', SubscriptionStatus.TRIALING],
    ['past_due', SubscriptionStatus.PAST_DUE],
    ['canceled', SubscriptionStatus.CANCELED],
    ['incomplete_expired', SubscriptionStatus.INCOMPLETE_EXPIRED],
    ['paused', SubscriptionStatus.PAUSED],
  ])('writes the Prisma enum for a %s Stripe subscription', async (stripeStatus, expected) => {
    await upsertFromStripeSubscription(
      DEMO_USER_ID,
      makeStripeSubscription({ status: stripeStatus }),
    );

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: expected }) }),
    );
  });

  it('stores an unrecognised Stripe status as INCOMPLETE so it grants nothing', async () => {
    await upsertFromStripeSubscription(
      DEMO_USER_ID,
      makeStripeSubscription({ status: 'brand_new_status' }),
    );

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: SubscriptionStatus.INCOMPLETE }),
      }),
    );
  });

  it('records the cancel-at-period-end flag', async () => {
    await upsertFromStripeSubscription(
      DEMO_USER_ID,
      makeStripeSubscription({ cancelAtPeriodEnd: true }),
    );

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ cancelAtPeriodEnd: true }),
      }),
    );
  });

  it('reads the customer id out of an expanded customer object', async () => {
    await upsertFromStripeSubscription(DEMO_USER_ID, withExpandedCustomer('cus_expanded_1'));

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeSubscriptionId: 'sub_expanded' },
        update: expect.objectContaining({ stripeCustomerId: 'cus_expanded_1' }),
      }),
    );
  });

  it('stores a null price id when the subscription carries no items', async () => {
    await upsertFromStripeSubscription(DEMO_USER_ID, withoutItems());

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ stripePriceId: null, currentPeriodEnd: null }),
      }),
    );
  });

  it('writes the same payload again for a replayed event, keeping the upsert idempotent', async () => {
    const subscription = makeStripeSubscription();

    await upsertFromStripeSubscription(DEMO_USER_ID, subscription);
    await upsertFromStripeSubscription(DEMO_USER_ID, subscription);

    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(2);
    const [first, second] = prismaMock.subscription.upsert.mock.calls;
    expect(second).toEqual(first);
  });
});
