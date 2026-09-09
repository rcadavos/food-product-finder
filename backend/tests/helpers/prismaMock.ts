/**
 * Hand-written stand-in for `src/lib/prisma`.
 *
 * It is deliberately not a fake database: every model method is a plain
 * `vi.fn()` so a test can both assert what the code wrote and dictate what it
 * reads back. `resetPrismaMock()` reinstalls a neutral, working default set —
 * the demo user exists, nobody is subscribed, no history — which is the state
 * most tests want before they change one thing.
 */

import { vi, type Mock } from 'vitest';
import { env } from '../../src/config/env';
import type { ProcessedStripeEvent, Search, Subscription, User } from '../../src/generated/prisma/client';
import { SubscriptionStatus } from '../../src/generated/prisma/enums';

export const DEMO_USER_ID = 'usr_demo_0000000000';

const BASE_TIME = new Date('2026-01-15T10:00:00.000Z');

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: DEMO_USER_ID,
    email: env.DEMO_USER_EMAIL,
    name: env.DEMO_USER_NAME,
    preferredLocale: 'en',
    stripeCustomerId: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...overrides,
  };
}

export function makeSearch(overrides: Partial<Search> = {}): Search {
  return {
    id: 'sch_0000000000',
    userId: DEMO_USER_ID,
    term: 'chocolate',
    locale: 'en',
    resultCount: 12,
    createdAt: BASE_TIME,
    ...overrides,
  };
}

export function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub_row_0000000000',
    userId: DEMO_USER_ID,
    stripeSubscriptionId: 'sub_stripe_1',
    stripeCustomerId: 'cus_test_1',
    stripePriceId: 'price_dummy',
    status: SubscriptionStatus.ACTIVE,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...overrides,
  };
}

/** The row `user.findUnique` resolves to; swap it with `setDemoUser()`. */
let demoUserRow: User = makeUser();

export function setDemoUser(overrides: Partial<User>): User {
  demoUserRow = makeUser({ ...demoUserRow, ...overrides });
  return demoUserRow;
}

export function currentDemoUser(): User {
  return demoUserRow;
}

interface UserWhere {
  where?: { id?: string; email?: string; stripeCustomerId?: string };
}

interface UpdateArgs {
  where?: { id?: string };
  data?: Partial<User>;
}

function readArg<T>(args: unknown): T {
  return (args ?? {}) as T;
}

export const prismaMock = {
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  search: {
    create: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  subscription: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  processedStripeEvent: {
    create: vi.fn(),
    delete: vi.fn(),
  },
  $disconnect: vi.fn(),
};

function allMocks(): Mock[] {
  const mocks: Mock[] = [prismaMock.$disconnect];
  for (const [key, value] of Object.entries(prismaMock)) {
    if (key === '$disconnect') continue;
    mocks.push(...Object.values(value as Record<string, Mock>));
  }
  return mocks;
}

/**
 * Reinstalls the default behaviour. Call it from `beforeEach`: the Vitest
 * config restores mocks between tests, which strips every implementation.
 */
export function resetPrismaMock(): void {
  for (const mock of allMocks()) {
    mock.mockReset();
  }
  demoUserRow = makeUser();

  prismaMock.user.findUnique.mockImplementation(async (args: unknown) => {
    const { where } = readArg<UserWhere>(args);
    if (where?.email !== undefined) return where.email === demoUserRow.email ? demoUserRow : null;
    if (where?.id !== undefined) return where.id === demoUserRow.id ? demoUserRow : null;
    return null;
  });

  prismaMock.user.findFirst.mockImplementation(async (args: unknown) => {
    const { where } = readArg<UserWhere>(args);
    if (where?.stripeCustomerId !== undefined) {
      return where.stripeCustomerId === demoUserRow.stripeCustomerId ? demoUserRow : null;
    }
    return null;
  });

  prismaMock.user.create.mockImplementation(async () => demoUserRow);

  prismaMock.user.update.mockImplementation(async (args: unknown) => {
    const { data } = readArg<UpdateArgs>(args);
    demoUserRow = makeUser({ ...demoUserRow, ...(data ?? {}) });
    return demoUserRow;
  });

  prismaMock.search.create.mockImplementation(async () => makeSearch());
  prismaMock.search.findMany.mockResolvedValue([]);
  prismaMock.search.deleteMany.mockResolvedValue({ count: 0 });

  prismaMock.subscription.findFirst.mockResolvedValue(null);
  prismaMock.subscription.findMany.mockResolvedValue([]);
  prismaMock.subscription.upsert.mockImplementation(async () => makeSubscription());
  prismaMock.subscription.update.mockImplementation(async () => makeSubscription());

  prismaMock.processedStripeEvent.create.mockImplementation(async (args: unknown) => {
    const { data } = readArg<{ data?: { id?: string; type?: string } }>(args);
    const row: ProcessedStripeEvent = {
      id: data?.id ?? 'evt_unknown',
      type: data?.type ?? 'unknown',
      processedAt: BASE_TIME,
    };
    return row;
  });

  prismaMock.processedStripeEvent.delete.mockImplementation(async (args: unknown) => {
    const { where } = readArg<{ where?: { id?: string } }>(args);
    const row: ProcessedStripeEvent = {
      id: where?.id ?? 'evt_unknown',
      type: 'unknown',
      processedAt: BASE_TIME,
    };
    return row;
  });
}

/** Convenience for the many tests that only care about "is the user subscribed". */
export function giveActiveSubscription(overrides: Partial<Subscription> = {}): Subscription {
  const row = makeSubscription(overrides);
  prismaMock.subscription.findMany.mockResolvedValue([row]);
  return row;
}
