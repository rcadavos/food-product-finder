/**
 * Stand-in for `src/lib/stripe`. Only the handful of SDK calls the application
 * makes are modelled; the fixtures below are trimmed Stripe objects cast to the
 * SDK types, because the real ones carry ~60 fields the code never reads.
 */

import { vi, type Mock } from 'vitest';
import type Stripe from 'stripe';

export const stripeMock = {
  customers: {
    create: vi.fn(),
  },
  checkout: {
    sessions: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
  },
  billingPortal: {
    sessions: {
      create: vi.fn(),
    },
  },
  subscriptions: {
    retrieve: vi.fn(),
    list: vi.fn(),
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
};

/** Mirrors the real module's export so `STRIPE_LOCALES[locale]` still resolves. */
export const STRIPE_LOCALES = { en: 'en', nl: 'nl', de: 'de', fr: 'fr' } as const;

function allMocks(): Mock[] {
  return [
    stripeMock.customers.create,
    stripeMock.checkout.sessions.create,
    stripeMock.checkout.sessions.retrieve,
    stripeMock.billingPortal.sessions.create,
    stripeMock.subscriptions.retrieve,
    stripeMock.subscriptions.list,
    stripeMock.webhooks.constructEvent,
  ];
}

export function resetStripeMock(): void {
  for (const mock of allMocks()) {
    mock.mockReset();
  }

  stripeMock.customers.create.mockResolvedValue({ id: 'cus_test_new' });
  stripeMock.checkout.sessions.create.mockResolvedValue({
    id: 'cs_test_123',
    url: 'https://checkout.stripe.test/c/pay/cs_test_123',
  });
  stripeMock.billingPortal.sessions.create.mockResolvedValue({
    id: 'bps_test_123',
    url: 'https://billing.stripe.test/p/session/bps_test_123',
  });
  // No pre-existing subscription unless a test says otherwise.
  stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
}

export interface StripeSubscriptionOptions {
  id?: string;
  customer?: string;
  status?: string;
  priceId?: string;
  cancelAtPeriodEnd?: boolean;
  /** Unix seconds on `items.data[0]`, where current Stripe API versions put it. */
  itemPeriodEnd?: number | null;
  /** Unix seconds at the subscription root, where older versions put it. */
  rootPeriodEnd?: number | null;
  userId?: string | null;
}

export function makeStripeSubscription(options: StripeSubscriptionOptions = {}): Stripe.Subscription {
  const {
    id = 'sub_stripe_1',
    customer = 'cus_test_1',
    status = 'active',
    priceId = 'price_dummy',
    cancelAtPeriodEnd = false,
    itemPeriodEnd = 1_800_000_000,
    rootPeriodEnd = null,
    userId = 'usr_demo_0000000000',
  } = options;

  const subscription: Record<string, unknown> = {
    id,
    object: 'subscription',
    customer,
    status,
    cancel_at_period_end: cancelAtPeriodEnd,
    metadata: userId === null ? {} : { userId },
    items: {
      object: 'list',
      data: [
        {
          id: `si_${id}`,
          object: 'subscription_item',
          price: { id: priceId, object: 'price' },
          ...(itemPeriodEnd === null ? {} : { current_period_end: itemPeriodEnd }),
        },
      ],
    },
  };

  if (rootPeriodEnd !== null) {
    subscription.current_period_end = rootPeriodEnd;
  }

  return subscription as unknown as Stripe.Subscription;
}

export function makeCheckoutSession(
  overrides: Partial<Record<string, unknown>> = {},
): Stripe.Checkout.Session {
  return {
    id: 'cs_test_123',
    object: 'checkout_session',
    client_reference_id: 'usr_demo_0000000000',
    customer: 'cus_test_1',
    subscription: 'sub_stripe_1',
    mode: 'subscription',
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

/** Wraps any payload in the Stripe event envelope the webhook route switches on. */
export function makeStripeEvent(id: string, type: string, object: unknown): Stripe.Event {
  return {
    id,
    object: 'event',
    type,
    api_version: '2026-01-01',
    created: 1_800_000_000,
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: { object },
  } as unknown as Stripe.Event;
}
