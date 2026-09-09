import type { SubscriptionStatusApi } from './api';
import { SubscriptionStatus } from '../generated/prisma/enums';
import { logger } from '../lib/logger';

// Re-exported instead of redeclared so the wire contract has a single definition.
export type { SubscriptionStatusApi };

const PRISMA_TO_API: Record<SubscriptionStatus, SubscriptionStatusApi> = {
  INCOMPLETE: 'incomplete',
  INCOMPLETE_EXPIRED: 'incomplete_expired',
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  UNPAID: 'unpaid',
  PAUSED: 'paused',
};

/**
 * Stripe types `subscription.status` as an open union (it can ship new values
 * before this code knows about them), so anything unmapped is stored as
 * INCOMPLETE: the safe end of the scale, since it grants no entitlement.
 */
const STRIPE_TO_PRISMA = new Map<string, SubscriptionStatus>([
  ['incomplete', SubscriptionStatus.INCOMPLETE],
  ['incomplete_expired', SubscriptionStatus.INCOMPLETE_EXPIRED],
  ['trialing', SubscriptionStatus.TRIALING],
  ['active', SubscriptionStatus.ACTIVE],
  ['past_due', SubscriptionStatus.PAST_DUE],
  ['canceled', SubscriptionStatus.CANCELED],
  ['unpaid', SubscriptionStatus.UNPAID],
  ['paused', SubscriptionStatus.PAUSED],
]);

export function mapPrismaStatusToApi(status: SubscriptionStatus): SubscriptionStatusApi {
  return PRISMA_TO_API[status];
}

export function mapStripeStatusToPrisma(status: string): SubscriptionStatus {
  const mapped = STRIPE_TO_PRISMA.get(status);
  if (mapped === undefined) {
    logger.warn('unknown stripe subscription status, storing as INCOMPLETE', { status });
    return SubscriptionStatus.INCOMPLETE;
  }
  return mapped;
}
