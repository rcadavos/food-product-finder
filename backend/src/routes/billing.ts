import { Router } from 'express';
import type Stripe from 'stripe';
import { z } from 'zod';
import { env } from '../config/env';
import { badRequest, internal, notFound, subscriptionExists, upstream } from '../lib/httpError';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { STRIPE_LOCALES, stripe } from '../lib/stripe';
import {
  getActiveSubscription,
  getSubscriptionSummary,
  upsertFromStripeSubscription,
} from '../services/subscriptionService';
import type { Locale } from '../types/api';

interface DemoUser {
  id: string;
  email: string;
  name: string | null;
  preferredLocale: string;
}

/**
 * Where to send the browser after Checkout. It is echoed straight into a Stripe
 * redirect URL, so it must be a path on our own site: a leading single slash,
 * and none of the characters that could start a scheme or a protocol-relative
 * host. Anything else is rejected rather than sanitised.
 */
const returnPathSchema = z
  .string()
  .max(512)
  .regex(/^\/(?![/\\])[A-Za-z0-9\-._~%/]*$/, 'returnPath must be a relative path on this site');

const bodySchema = z.object({
  locale: z.enum(['en', 'nl', 'de', 'fr']).default('en'),
  returnPath: returnPathSchema.optional(),
});

const confirmSchema = z.object({
  sessionId: z.string().min(1).max(255),
});

function parseBody(body: unknown): { locale: Locale; returnPath?: string } {
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw badRequest('Invalid request body', z.flattenError(parsed.error));
  }
  return parsed.data;
}

function parseLocale(body: unknown): Locale {
  return parseBody(body).locale;
}

/**
 * Stripe failures are upstream failures: they are logged with the SDK's own
 * message, but that message only reaches the client outside production, where
 * it can leak account details into a browser.
 */
async function callStripe<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('stripe request failed', { operation, message });
    throw upstream(
      'Stripe request failed',
      env.NODE_ENV === 'production' ? undefined : { operation, message },
    );
  }
}

async function ensureStripeCustomerId(user: DemoUser): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { id: user.id } });
  const existingCustomerId = existing?.stripeCustomerId;
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const customer = await callStripe('customers.create', () =>
    stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    }),
  );

  // Persisted immediately so a second checkout reuses the customer instead of
  // creating a duplicate one in the Stripe dashboard.
  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });
  logger.info('created stripe customer', { userId: user.id, customerId: customer.id });

  return customer.id;
}

/**
 * Stripe statuses that mean the customer is already on the plan. `incomplete` is
 * deliberately absent: an abandoned checkout leaves one behind, and treating that
 * as "already subscribed" would lock the user out until Stripe expired it.
 */
const BLOCKING_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'paused',
]);

/**
 * The local projection only moves when a webhook arrives. Asking Stripe directly
 * costs one call on a rare, user-initiated action, and it is what stops a missed
 * delivery from turning a second click into a second paid subscription.
 */
async function findLiveStripeSubscription(customerId: string): Promise<Stripe.Subscription | null> {
  const list = await callStripe('subscriptions.list', () =>
    stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 }),
  );
  return list.data.find((subscription) => BLOCKING_STATUSES.has(subscription.status)) ?? null;
}

export const billingRouter: Router = Router();

/**
 * Checkout returns to the success page, which reconciles the subscription and
 * then forwards to wherever the user pressed Subscribe. Cancelling skips the
 * success page entirely and drops them straight back where they were.
 */
function buildReturnUrls(locale: Locale, returnPath: string | undefined): {
  successUrl: string;
  cancelUrl: string;
} {
  const base = `${env.FRONTEND_URL}/${locale}`;
  const next = returnPath === undefined ? '' : `&next=${encodeURIComponent(returnPath)}`;
  return {
    successUrl: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}${next}`,
    cancelUrl: returnPath === undefined ? `${base}/billing/cancel` : `${base}${returnPath}`,
  };
}

billingRouter.post('/checkout-session', async (req, res) => {
  const user = req.user!;
  const { locale, returnPath } = parseBody(req.body);

  // Fast path: the projection already knows this user is subscribed.
  const localSubscription = await getActiveSubscription(user.id);
  if (localSubscription) {
    logger.info('refused duplicate checkout', {
      userId: user.id,
      stripeSubscriptionId: localSubscription.stripeSubscriptionId,
      source: 'local',
    });
    throw subscriptionExists();
  }

  const customerId = await ensureStripeCustomerId(user);

  const liveSubscription = await findLiveStripeSubscription(customerId);
  if (liveSubscription) {
    // Stripe knew about a subscription the projection had missed, so repair the
    // projection before refusing: the next request then reports the truth.
    await upsertFromStripeSubscription(user.id, liveSubscription);
    logger.warn('refused duplicate checkout and repaired a stale projection', {
      userId: user.id,
      stripeSubscriptionId: liveSubscription.id,
      status: liveSubscription.status,
      source: 'stripe',
    });
    throw subscriptionExists();
  }

  const { successUrl, cancelUrl } = buildReturnUrls(locale, returnPath);

  const session = await callStripe('checkout.sessions.create', () =>
    stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      locale: STRIPE_LOCALES[locale],
      // Mirrored on the subscription so `customer.subscription.*` webhooks can
      // find the local user without a second lookup.
      subscription_data: { metadata: { userId: user.id } },
      allow_promotion_codes: true,
    }),
  );

  if (!session.url) {
    throw internal('Stripe did not return a checkout URL');
  }

  res.json({ url: session.url, sessionId: session.id });
});

/**
 * Reconciles a finished Checkout without waiting for the webhook.
 *
 * Webhook delivery is best-effort: the CLI tunnel can be down, the process can
 * be restarting, the network can drop it. Relying on it alone means a customer
 * who has genuinely paid can sit unentitled forever. Stripe's own guidance is to
 * fulfil on both the redirect and the webhook, so this endpoint does the same
 * work as `checkout.session.completed`, and `upsertFromStripeSubscription` keys
 * on the Stripe subscription id, which makes running both harmless.
 */
billingRouter.post('/confirm', async (req, res) => {
  const user = req.user!;
  const parsed = confirmSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw badRequest('Invalid request body', z.flattenError(parsed.error));
  }

  const session = await callStripe('checkout.sessions.retrieve', () =>
    stripe.checkout.sessions.retrieve(parsed.data.sessionId),
  );

  // A session id is guessable enough that it must not be a capability on its
  // own: it only counts if Stripe says it belongs to this user.
  if (session.client_reference_id !== user.id) {
    logger.warn('rejected a checkout confirmation for another user', {
      userId: user.id,
      sessionId: parsed.data.sessionId,
    });
    throw notFound('No checkout session matches this user.');
  }

  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : (session.subscription?.id ?? null);

  if (subscriptionId !== null) {
    const subscription = await callStripe('subscriptions.retrieve', () =>
      stripe.subscriptions.retrieve(subscriptionId),
    );
    await upsertFromStripeSubscription(user.id, subscription);
    logger.info('reconciled a subscription from the checkout redirect', {
      userId: user.id,
      stripeSubscriptionId: subscriptionId,
      status: subscription.status,
    });
  }

  res.json({ subscription: await getSubscriptionSummary(user.id) });
});

billingRouter.post('/portal-session', async (req, res) => {
  const user = req.user!;
  const locale = parseLocale(req.body);

  const existing = await prisma.user.findUnique({ where: { id: user.id } });
  const customerId = existing?.stripeCustomerId;
  if (!customerId) {
    throw badRequest('No Stripe customer exists for this user yet. Subscribe first.');
  }

  const session = await callStripe('billingPortal.sessions.create', () =>
    stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${env.FRONTEND_URL}/${locale}`,
    }),
  );

  res.json({ url: session.url });
});
