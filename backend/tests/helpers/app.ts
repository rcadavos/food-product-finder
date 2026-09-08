/**
 * Builds the real Express application for the integration tests.
 *
 * The module graph is untouched: `createApp()` is the production factory. What
 * the tests replace is only the three edges of the process — Prisma, Stripe and
 * `fetch` — which each test file declares with its own `vi.mock` calls before
 * importing this helper.
 */

import request from 'supertest';
import type { Express } from 'express';
import type { Mock } from 'vitest';
import { createApp } from '../../src/app';
import { resetDemoUserCache } from '../../src/middleware/demoUser';
import { clearOffCache } from '../../src/services/openFoodFacts/client';
import { installFetchMock } from './offFixtures';
import { resetPrismaMock } from './prismaMock';
import { resetStripeMock } from './stripeMock';

export function createTestApp(): Express {
  return createApp();
}

export function testAgent(): ReturnType<typeof request> {
  return request(createTestApp());
}

/**
 * Puts the process back to a known state: fresh mocks, an empty Open Food Facts
 * cache and no memoised demo user. Both caches live in module-level variables
 * that would otherwise carry results between tests in the same file.
 */
export function resetBackendState(): Mock {
  resetPrismaMock();
  resetStripeMock();
  clearOffCache();
  resetDemoUserCache();
  return installFetchMock();
}
