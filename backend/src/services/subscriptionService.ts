import type Stripe from 'stripe';
import { Prisma } from '../generated/prisma/client';
import type { Subscription } from '../generated/prisma/client';
import { SubscriptionStatus } from '../generated/prisma/enums';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import type { AccountResponse } from '../types/api';
import { mapPrismaStatusToApi, mapStripeStatusToPrisma } from '../types/subscription';

/** Statuses that grant access. `past_due` deliberately does not. */
const ENTITLING_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
]);

function toIsoOrNull(value: Date | null): string | null {
  if (value === null) {
    return null;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function isEntitling(subscription: Subscription, now: Date): boolean {
  if (!ENTITLING_STATUSES.has(subscription.status)) {
    return false;
  }
  const periodEnd = subscription.currentPeriodEnd;
  return periodEnd === null || new Date(periodEnd).getTime() > now.getTime();
}

/**
 * A user accumulates at most a handful of subscription rows, so the whole set is
 * read once and the "is this one still valid" rule lives in a single place
 * instead of being spread over several `where` clauses.
 */
async function listNewestFirst(userId: string): Promise<Subscription[]> {
  return prisma.subscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getActiveSubscription(userId: string): Promise<Subscription | null> {
  const now = new Date();
  const subscriptions = await listNewestFirst(userId);
  return subscriptions.find((subscription) => isEntitling(subscription, now)) ?? null;
}

export async function getEntitlements(userId: string): Promise<{ nutrition: boolean }> {
  const active = await getActiveSubscription(userId);
  return { nutrition: active !== null };
}

export async function getSubscriptionSummary(
  userId: string,
): Promise<AccountResponse['subscription']> {
  const now = new Date();
  const subscriptions = await listNewestFirst(userId);
  const active = subscriptions.find((subscription) => isEntitling(subscription, now));
  // With no active row we still report the newest one, so the UI can explain
  // *why* access is closed (past due, cancelled, payment incomplete, ...).
  const reported = active ?? subscriptions[0];

  if (reported === undefined) {
    return { status: 'none', active: false, currentPeriodEnd: null, cancelAtPeriodEnd: false };
  }

  return {
    status: mapPrismaStatusToApi(reported.status),
    active: active !== undefined,
    currentPeriodEnd: toIsoOrNull(reported.currentPeriodEnd),
    cancelAtPeriodEnd: reported.cancelAtPeriodEnd,
  };
}

/**
 * Newer Stripe API versions moved `current_period_end` from the subscription to
 * its items; both locations are read so the projection survives either version.
 */
function readCurrentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const itemPeriodEnd: unknown = subscription.items?.data?.[0]?.current_period_end;
  if (typeof itemPeriodEnd === 'number') {
    return new Date(itemPeriodEnd * 1000);
  }
  const rootPeriodEnd: unknown = (subscription as unknown as Record<string, unknown>)
    .current_period_end;
  if (typeof rootPeriodEnd === 'number') {
    return new Date(rootPeriodEnd * 1000);
  }
  return null;
}

function readCustomerId(subscription: Stripe.Subscription): string {
  const customer: unknown = subscription.customer;
  if (typeof customer === 'string') {
    return customer;
  }
  if (typeof customer === 'object' && customer !== null && 'id' in customer) {
    const id = customer.id;
    if (typeof id === 'string') {
      return id;
    }
  }
  logger.warn('stripe subscription without a customer id', { subscriptionId: subscription.id });
  return '';
}

export async function upsertFromStripeSubscription(
  userId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const firstItem = sub.items?.data?.[0];
  const data = {
    userId,
    stripeCustomerId: readCustomerId(sub),
    stripePriceId: firstItem?.price?.id ?? null,
    status: mapStripeStatusToPrisma(sub.status),
    currentPeriodEnd: readCurrentPeriodEnd(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
  };

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: sub.id },
    create: { stripeSubscriptionId: sub.id, ...data },
    update: data,
  });

  logger.info('subscription projection updated', {
    userId,
    stripeSubscriptionId: sub.id,
    status: data.status,
  });
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2002';
  }
  // Prisma errors can arrive through a different module instance (or a test
  // double), which breaks `instanceof`; the error code is the reliable signal.
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
  );
}

/**
 * Claims a Stripe event id. Returns `false` when the id was already recorded,
 * which is how the webhook endpoint stays idempotent under Stripe's
 * at-least-once delivery.
 */
export async function markProcessed(eventId: string, type: string): Promise<boolean> {
  try {
    await prisma.processedStripeEvent.create({ data: { id: eventId, type } });
    return true;
  } catch (error: unknown) {
    if (isUniqueConstraintViolation(error)) {
      logger.debug('stripe event already processed', { eventId, type });
      return false;
    }
    throw error;
  }
}
