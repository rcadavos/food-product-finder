import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { getEntitlements } from '../services/subscriptionService';

export interface DemoUser {
  id: string;
  email: string;
  name: string | null;
  preferredLocale: string;
}

// The application has no authentication: every request runs as one seeded
// user. Its row never changes, so it is resolved once per process.
let cachedUser: DemoUser | null = null;
let inFlight: Promise<DemoUser> | null = null;

export function resetDemoUserCache(): void {
  cachedUser = null;
  inFlight = null;
}

function toDemoUser(row: {
  id: string;
  email: string;
  name: string | null;
  preferredLocale: string;
}): DemoUser {
  return { id: row.id, email: row.email, name: row.name, preferredLocale: row.preferredLocale };
}

async function findOrCreateDemoUser(): Promise<DemoUser> {
  const where = { email: env.DEMO_USER_EMAIL };
  const existing = await prisma.user.findUnique({ where });
  if (existing) return toDemoUser(existing);

  try {
    const created = await prisma.user.create({
      data: { email: env.DEMO_USER_EMAIL, name: env.DEMO_USER_NAME, preferredLocale: 'en' },
    });
    logger.info('Created the demo user', { email: created.email });
    return toDemoUser(created);
  } catch (error) {
    // `db:seed` or a second worker may have inserted the same email between
    // the read and the write; the unique index makes that a lost race, not a bug.
    const raced = await prisma.user.findUnique({ where });
    if (raced) return toDemoUser(raced);
    throw error;
  }
}

async function loadDemoUser(): Promise<DemoUser> {
  if (cachedUser) return cachedUser;
  inFlight ??= findOrCreateDemoUser().finally(() => {
    inFlight = null;
  });
  cachedUser = await inFlight;
  return cachedUser;
}

export const demoUser: RequestHandler = async (req, _res, next) => {
  try {
    const user = await loadDemoUser();
    req.user = user;
    req.entitlements = await getEntitlements(user.id);
    next();
  } catch (error) {
    next(error);
  }
};
