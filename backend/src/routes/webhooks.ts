import { Router, type Response } from 'express';
import type Stripe from 'stripe';
import { env } from '../config/env';
import type { User } from '../generated/prisma/client';
import type { ErrorCode } from '../lib/httpError';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { stripe } from '../lib/stripe';
import { markProcessed, upsertFromStripeSubscription } from '../services/subscriptionService';

/**
 * Answered here instead of by throwing an `HttpError`, because a signature
 * problem must always be a 400 and must never depend on the error middleware
 * being reached through the raw-body router mounted ahead of the JSON parser.
 */
function sendBadRequest(res: Response, message: string): void {
  const code: ErrorCode = 'VALIDATION_ERROR';
  res.status(400).json({ error: { code, message } });
}

/** Expandable Stripe fields arrive either as an id or as the full object. */
function readIdRef(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.length > 0 ? value : null;
  }
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = value.id;
    if (typeof id === 'string' && id.length > 0) {
      return id;
    }
  }
  return null;
}

/**
 * Stripe retries every non-2xx response for days. An event that cannot be
 * matched to a local user is a data problem on this side, not a delivery
 * problem on Stripe's, so it is logged loudly and acknowledged instead of
 * being turned into an endless retry loop.
 */
function logUnresolvedUser(eventType: string, context: Record<string, unknown>): void {
  logger.warn('stripe event could not be matched to a local user', {
    eventType,
    ...context,
  });
}

async function resolveUser(candidate: {
  userId?: string | null;
  customerId?: string | null;
}): Promise<User | null> {
  if (candidate.userId) {
    const byId = await prisma.user.findUnique({ where: { id: candidate.userId } });
    if (byId) {
      return byId;
    }
    logger.warn('stripe event referenced an unknown user id', { userId: candidate.userId });
  }

  if (candidate.customerId) {
    const byCustomer = await prisma.user.findFirst({
      where: { stripeCustomerId: candidate.customerId },
    });
    if (byCustomer) {
      return byCustomer;
    }
  }

  return null;
}

/**
 * Undoes the idempotency claim taken before dispatch. A claim left behind by a
 * failed side effect is unrecoverable: Stripe's retry would be answered
 * `duplicate` and the subscription change dropped for good.
 */
async function releaseClaim(eventId: string): Promise<void> {
  try {
    await prisma.processedStripeEvent.delete({ where: { id: eventId } });
  } catch (error: unknown) {
    logger.error('could not release the claim on a failed stripe event', {
      eventId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function linkStripeCustomer(user: User, customerId: string | null): Promise<void> {
  if (customerId === null || user.stripeCustomerId !== null) {
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  logger.info('linked stripe customer to user', { userId: user.id, customerId });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const customerId = readIdRef(session.customer);
  const user = await resolveUser({ userId: session.client_reference_id, customerId });
  if (user === null) {
    logUnresolvedUser('checkout.session.completed', { sessionId: session.id, customerId });
    return;
  }

  await linkStripeCustomer(user, customerId);

  const subscriptionId = readIdRef(session.subscription);
  if (subscriptionId === null) {
    logger.warn('checkout session completed without a subscription', { sessionId: session.id });
    return;
  }

  // The session only carries the subscription id, so the full object is fetched
  // and the projection stores the real status and period end.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await upsertFromStripeSubscription(user.id, subscription);
}

async function handleSubscriptionChanged(
  subscription: Stripe.Subscription,
  eventType: string,
  deleted: boolean,
): Promise<void> {
  const customerId = readIdRef(subscription.customer);
  const metadataUserId = subscription.metadata?.userId;
  const user = await resolveUser({
    userId: typeof metadataUserId === 'string' ? metadataUserId : null,
    customerId,
  });
  if (user === null) {
    logUnresolvedUser(eventType, { subscriptionId: subscription.id, customerId });
    return;
  }

  await linkStripeCustomer(user, customerId);

  // A deletion is terminal locally, even when the snapshot inside the event
  // still carries the status the subscription had just before it was removed.
  const projected: Stripe.Subscription = deleted
    ? { ...subscription, status: 'canceled' }
    : subscription;
  await upsertFromStripeSubscription(user.id, projected);
}

function readInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = readIdRef(invoice.parent?.subscription_details?.subscription);
  if (fromParent !== null) {
    return fromParent;
  }
  // Older API versions expose the subscription at the invoice root.
  return readIdRef((invoice as unknown as Record<string, unknown>).subscription);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = readIdRef(invoice.customer);
  logger.warn('stripe invoice payment failed', { invoiceId: invoice.id ?? null, customerId });

  const subscriptionId = readInvoiceSubscriptionId(invoice);
  if (subscriptionId === null) {
    return;
  }

  const user = await resolveUser({ customerId });
  if (user === null) {
    logUnresolvedUser('invoice.payment_failed', { customerId, subscriptionId });
    return;
  }

  // Stripe has already moved the subscription to past_due or unpaid; refreshing
  // the projection closes access without waiting for a separate event.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await upsertFromStripeSubscription(user.id, subscription);
}

export const webhooksRouter: Router = Router();

webhooksRouter.post('/', async (req, res) => {
  const signature = req.header('stripe-signature');
  if (signature === undefined) {
    sendBadRequest(res, 'Missing Stripe signature header');
    return;
  }

  const payload: unknown = req.body;
  if (!Buffer.isBuffer(payload) && typeof payload !== 'string') {
    logger.error('stripe webhook body was parsed before verification; raw bytes are required');
    sendBadRequest(res, 'Expected the raw request body');
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error: unknown) {
    logger.warn('stripe signature verification failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    sendBadRequest(res, 'Invalid Stripe signature');
    return;
  }

  // The event id is claimed before any side effect runs: Stripe delivers at
  // least once, and two concurrent deliveries would otherwise both be applied.
  const firstDelivery = await markProcessed(event.id, event.type);
  if (!firstDelivery) {
    res.json({ received: true, duplicate: true });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChanged(event.data.object, event.type, false);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionChanged(event.data.object, event.type, true);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      default:
        logger.debug('unhandled stripe event', { type: event.type });
    }
  } catch (error: unknown) {
    // Releasing the claim turns the retry Stripe is about to send into a first
    // delivery, so the change is applied instead of being skipped as a replay.
    await releaseClaim(event.id);
    throw error;
  }

  res.json({ received: true });
});
