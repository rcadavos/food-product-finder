import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

export const locales = ['en', 'nl', 'de', 'fr'] as const;
export type Locale = (typeof locales)[number];

const runningTests = process.env.NODE_ENV === 'test';

// Tests set their environment programmatically; reading a developer's .env
// there would make the suite depend on the machine it runs on.
if (!runningTests) {
  loadDotenv({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

/** Required outside tests; the message replaces zod's "expected string, received undefined". */
const required = () => z.string({ error: 'is required but not set' }).min(1, 'must not be empty');

const intVar = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intVar(4000, 1, 65535),

  DATABASE_URL: required(),
  SHADOW_DATABASE_URL: z.string().min(1).optional(),

  FRONTEND_URL: z.url().default('http://localhost:3000').transform(trimTrailingSlash),
  CORS_ORIGINS: z.string().optional(),

  DEMO_USER_EMAIL: z.email().default('demo@foodproductfinder.test'),
  DEMO_USER_NAME: z.string().min(1).default('Demo User'),

  OFF_BASE_URL: z.url().default('https://world.openfoodfacts.org').transform(trimTrailingSlash),
  OFF_USER_AGENT: z
    .string()
    .min(1)
    .default('FoodProductFinder/1.0 (technical test; contact@example.com)'),
  OFF_TIMEOUT_MS: intVar(8_000, 500, 60_000),
  OFF_CACHE_TTL_MS: intVar(300_000, 0, 3_600_000),
  OFF_CACHE_MAX_ENTRIES: intVar(200, 1, 10_000),

  STRIPE_SECRET_KEY: required(),
  STRIPE_WEBHOOK_SECRET: required(),
  STRIPE_PRICE_ID: required(),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

type ParsedEnv = z.infer<typeof envSchema>;

export type AppEnv = Omit<ParsedEnv, 'CORS_ORIGINS'> & {
  /** Already split, trimmed and de-duplicated; falls back to `[FRONTEND_URL]`. */
  CORS_ORIGINS: string[];
};

/**
 * Placeholders so the test suite can import the app without a `.env` file and
 * without ever reaching a real database or Stripe account.
 */
const TEST_DEFAULTS: Readonly<Record<string, string>> = {
  DATABASE_URL: 'mysql://test:test@localhost:3306/food_product_finder_test',
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
  STRIPE_PRICE_ID: 'price_dummy',
};

function collectRaw(source: NodeJS.ProcessEnv): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    // An empty variable in a .env file means "unset", not "empty string".
    if (typeof value === 'string' && value.trim() !== '') {
      raw[key] = value;
    }
  }
  if (source.NODE_ENV === 'test') {
    for (const [key, value] of Object.entries(TEST_DEFAULTS)) {
      raw[key] ??= value;
    }
  }
  return raw;
}

function parseOrigins(value: string | undefined, frontendUrl: string): string[] {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => trimTrailingSlash(origin.trim()))
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? [...new Set(origins)] : [frontendUrl];
}

function loadEnv(): AppEnv {
  const result = envSchema.safeParse(collectRaw(process.env));

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid backend environment configuration:\n${problems}\n` +
        'Copy backend/.env.example to backend/.env and fill in the missing values.',
    );
  }

  const { CORS_ORIGINS, ...rest } = result.data;
  return { ...rest, CORS_ORIGINS: parseOrigins(CORS_ORIGINS, rest.FRONTEND_URL) };
}

export const env: AppEnv = loadEnv();

export const isTest = env.NODE_ENV === 'test';
