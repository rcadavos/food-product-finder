/**
 * Shared response shapes of the Express API.
 *
 * This file mirrors `backend/src/types/api.ts` on purpose. The two apps are deliberately
 * not coupled through a shared workspace package: each one has to be buildable and
 * deployable on its own (different runtimes, different release cadence), and a third
 * package would drag a build step into both. The duplication is small, frozen by the
 * API contract, and any drift shows up immediately as a type error at the call site.
 * If either side changes, change both.
 */

export type Locale = 'en' | 'nl' | 'de' | 'fr';

export type ErrorCode =
  | 'VALIDATION_ERROR' // 400
  | 'NOT_FOUND' // 404
  | 'SUBSCRIPTION_REQUIRED' // 402
  | 'SUBSCRIPTION_EXISTS' // 409
  | 'RATE_LIMITED' // 429
  | 'UPSTREAM_ERROR' // 502
  | 'UPSTREAM_TIMEOUT' // 504
  | 'INTERNAL_ERROR'; // 500

/** Envelope returned by the API for every non-2xx response. */
export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/** Which language the text actually came from, so the UI can flag fallbacks. */
export type TextSource = 'requested' | 'default' | 'english' | 'other' | 'missing';

export interface LocalizedText {
  value: string | null;
  source: TextSource;
}

export interface ProductSummary {
  barcode: string;
  name: LocalizedText;
  brands: string[];
  imageUrl: string | null;
  quantity: string | null;
  nutriscoreGrade: string | null; // 'a'..'e', or null / 'unknown' filtered to null
  /** Field names OFF had no usable value for, e.g. ['name','imageUrl']. */
  missingFields: string[];
}

/** A country the product is sold in, plus its ISO code when the API resolved one. */
export interface CountryTag {
  name: string;
  /** ISO 3166-1 alpha-2, or null for a country the API does not map. */
  code: string | null;
}

export interface ProductDetail extends ProductSummary {
  genericName: LocalizedText;
  ingredientsText: LocalizedText;
  categories: string[];
  labels: string[];
  allergens: string[];
  countries: CountryTag[];
  servingSize: string | null;
  novaGroup: number | null;
  ecoscoreGrade: string | null;
  /** Canonical Open Food Facts page for this product in the requested language. */
  sourceUrl: string;
}

/** Fixed, ordered nutrient keys. The UI translates these keys. */
export type NutrientKey =
  | 'energy-kcal'
  | 'fat'
  | 'saturated-fat'
  | 'carbohydrates'
  | 'sugars'
  | 'fiber'
  | 'proteins'
  | 'salt'
  | 'sodium';

/** The order the backend serializes nutrients in, and the order the UI renders them. */
export const NUTRIENT_KEYS: readonly NutrientKey[] = [
  'energy-kcal',
  'fat',
  'saturated-fat',
  'carbohydrates',
  'sugars',
  'fiber',
  'proteins',
  'salt',
  'sodium',
];

export interface Nutrient {
  key: NutrientKey;
  per100g: number | null;
  perServing: number | null;
  unit: string | null;
}

export interface NutritionFacts {
  nutrients: Nutrient[]; // always all 9 keys, in the order above
  servingSize: string | null;
  hasPerServing: boolean;
  nutriscoreGrade: string | null;
  novaGroup: number | null;
  /** true when OFF returned no nutriments at all. */
  isEmpty: boolean;
}

export type SubscriptionStatusApi =
  | 'none'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

export interface AccountResponse {
  user: { id: string; email: string; name: string | null; preferredLocale: string };
  subscription: {
    status: SubscriptionStatusApi;
    active: boolean;
    currentPeriodEnd: string | null; // ISO 8601
    cancelAtPeriodEnd: boolean;
  };
  entitlements: { nutrition: boolean };
}

export interface SearchResponse {
  query: string;
  locale: Locale;
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  products: ProductSummary[];
}

export interface ProductResponse {
  product: ProductDetail;
  nutrition: NutritionFacts | null; // null whenever `entitled` is false
  nutritionLocked: boolean; // true when not entitled
  entitled: boolean;
}

export interface RecentSearch {
  id: string;
  term: string;
  locale: string;
  resultCount: number;
  createdAt: string; // ISO 8601
}
