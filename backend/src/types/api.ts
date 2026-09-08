/**
 * Shared HTTP response types for the whole backend.
 *
 * `frontend/src/lib/types.ts` keeps a hand-maintained mirror of this module:
 * there is no shared package on purpose, so the two apps stay independently
 * deployable.
 */

export type { ErrorCode } from '../lib/httpError';

export type Locale = 'en' | 'nl' | 'de' | 'fr';

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
  /** 'a'..'e'; Open Food Facts' 'unknown'/'not-applicable' are normalised to null. */
  nutriscoreGrade: string | null;
  /** Field names Open Food Facts had no usable value for, e.g. ['name','imageUrl']. */
  missingFields: string[];
}

/** A country the product is sold in, plus its ISO code when we can resolve one. */
export interface CountryTag {
  name: string;
  /** ISO 3166-1 alpha-2, or null when Open Food Facts used a country we do not map. */
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

/** Render order of the nutrition table; also the set of nutrients we read from OFF. */
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
  /** Always all nine keys, in `NUTRIENT_KEYS` order. */
  nutrients: Nutrient[];
  servingSize: string | null;
  hasPerServing: boolean;
  nutriscoreGrade: string | null;
  novaGroup: number | null;
  /** true when Open Food Facts returned no nutriments at all. */
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
    /** ISO 8601. */
    currentPeriodEnd: string | null;
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
  /** null whenever `entitled` is false — the gate is enforced server-side. */
  nutrition: NutritionFacts | null;
  nutritionLocked: boolean;
  entitled: boolean;
}

export interface RecentSearch {
  id: string;
  term: string;
  locale: string;
  resultCount: number;
  /** ISO 8601. */
  createdAt: string;
}
