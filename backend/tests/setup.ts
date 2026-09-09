/**
 * Runs before every test file.
 *
 * `src/config/env` parses `process.env` at import time, so the whole
 * environment is pinned here — the suite must behave identically on a laptop
 * with a populated `backend/.env` and on a bare CI box without one.
 */

import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.DEMO_USER_EMAIL = 'demo@foodproductfinder.test';
process.env.DEMO_USER_NAME = 'Demo User';
process.env.OFF_BASE_URL = 'https://off.test';
process.env.OFF_USER_AGENT = 'FoodProductFinder/1.0 (test suite)';
process.env.OFF_TIMEOUT_MS = '8000';
process.env.OFF_CACHE_TTL_MS = '300000';
process.env.OFF_CACHE_MAX_ENTRIES = '200';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
process.env.STRIPE_PRICE_ID = 'price_dummy';
process.env.LOG_LEVEL = 'error';

delete process.env.SHADOW_DATABASE_URL;

/**
 * Safety net: no test may reach the network. Files that exercise the Open Food
 * Facts client replace this with their own stub in `beforeEach`.
 */
vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.reject(new Error('Unexpected network access in a test'))),
);
