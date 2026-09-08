/**
 * Pure Open Food Facts -> API mappers. No I/O and no throwing - every possible
 * subset of fields must still produce a valid object, because the data quality
 * of a crowdsourced database is out of our control.
 */

import {
  NUTRIENT_KEYS,
  type CountryTag,
  type Locale,
  type LocalizedText,
  type Nutrient,
  type NutrientKey,
  type NutritionFacts,
  type ProductDetail,
  type ProductSummary,
} from '../../types/api';
import { countryCodeFromTag } from './countryCodes';
import { readRecord, readString, readStringArray, type OffProduct } from './types';

const MAX_TAGS = 12;

/** Matches `product_name_pt` and `ingredients_text_pt-br`, not `ingredients_text_with_allergens`. */
const LANGUAGE_SUFFIX = /^[a-z]{2,3}([-_][a-z]{2})?$/;

/** Tags OFF could not translate keep their language prefix, e.g. `en:cocoa-butter`. */
const UNTRANSLATED_TAG = /^[a-z]{2,3}:/i;

const GRADE_PLACEHOLDERS = new Set(['unknown', 'not-applicable', 'none']);

const NUTRIENT_DEFAULT_UNITS: Record<NutrientKey, string> = {
  'energy-kcal': 'kcal',
  fat: 'g',
  'saturated-fat': 'g',
  carbohydrates: 'g',
  sugars: 'g',
  fiber: 'g',
  proteins: 'g',
  salt: 'g',
  sodium: 'g',
};

const PUBLIC_OFF_DOMAIN = 'openfoodfacts.org';

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function splitBrands(value: string | undefined | null): string[] {
  if (!value) {
    return [];
  }
  const seen = new Set<string>();
  const brands: string[] = [];
  for (const part of value.split(',')) {
    const brand = part.trim();
    const fingerprint = brand.toLowerCase();
    if (brand === '' || seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    brands.push(brand);
  }
  return brands;
}

export function cleanTags(tags: readonly string[] | undefined): string[] {
  if (!tags) {
    return [];
  }
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    const fingerprint = tag.toLowerCase();
    if (tag === '' || UNTRANSLATED_TAG.test(tag) || seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    cleaned.push(tag);
    if (cleaned.length === MAX_TAGS) {
      break;
    }
  }
  return cleaned;
}

export function normalizeGrade(value: string | undefined | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const grade = value.trim().toLowerCase();
  if (grade === '' || GRADE_PLACEHOLDERS.has(grade)) {
    return null;
  }
  return grade;
}

export function pickImageUrl(product: OffProduct): string | null {
  for (const key of ['image_front_url', 'image_front_small_url', 'image_url']) {
    const url = readString(product, key)?.trim();
    if (url && url.startsWith('http')) {
      return url;
    }
  }
  return null;
}

/**
 * Fallback chain: requested language -> the product default field -> English ->
 * any other language OFF happens to carry.
 */
export function resolveText(product: OffProduct, baseKey: string, locale: Locale): LocalizedText {
  const requested = readText(product, `${baseKey}_${locale}`);
  if (requested !== null) {
    return { value: requested, source: 'requested' };
  }
  const productDefault = readText(product, baseKey);
  if (productDefault !== null) {
    return { value: productDefault, source: 'default' };
  }
  const english = readText(product, `${baseKey}_en`);
  if (english !== null) {
    return { value: english, source: 'english' };
  }
  const other = readAnyLanguage(product, baseKey);
  if (other !== null) {
    return { value: other, source: 'other' };
  }
  return { value: null, source: 'missing' };
}

export function mapProductSummary(product: OffProduct, locale: Locale): ProductSummary {
  const name = resolveText(product, 'product_name', locale);
  const brands = splitBrands(readString(product, 'brands'));
  const imageUrl = pickImageUrl(product);
  const quantity = readText(product, 'quantity');
  const nutriscoreGrade = normalizeGrade(readString(product, 'nutriscore_grade'));

  return {
    barcode: readText(product, 'code') ?? '',
    name,
    brands,
    imageUrl,
    quantity,
    nutriscoreGrade,
    missingFields: collectMissing([
      ['name', name.value === null],
      ['brands', brands.length === 0],
      ['imageUrl', imageUrl === null],
      ['quantity', quantity === null],
      ['nutriscoreGrade', nutriscoreGrade === null],
    ]),
  };
}

export function mapProductDetail(product: OffProduct, locale: Locale, offBaseUrl: string): ProductDetail {
  const summary = mapProductSummary(product, locale);
  const ingredientsText = resolveText(product, 'ingredients_text', locale);
  const categories = readTags(product, 'categories_tags', locale);

  return {
    ...summary,
    genericName: resolveText(product, 'generic_name', locale),
    ingredientsText,
    categories,
    labels: readTags(product, 'labels_tags', locale),
    allergens: readTags(product, 'allergens_tags', locale),
    countries: readCountries(product, locale),
    servingSize: readText(product, 'serving_size'),
    novaGroup: readNovaGroup(product),
    ecoscoreGrade: normalizeGrade(readString(product, 'ecoscore_grade')),
    sourceUrl: `${localizedOffOrigin(locale, offBaseUrl)}/product/${summary.barcode}`,
    missingFields: [
      ...summary.missingFields,
      ...collectMissing([
        ['ingredientsText', ingredientsText.value === null],
        ['categories', categories.length === 0],
      ]),
    ],
  };
}

export function mapNutrition(product: OffProduct): NutritionFacts {
  const nutriments = readRecord(product, 'nutriments');
  const nutrients: Nutrient[] = NUTRIENT_KEYS.map((key) => {
    const per100g = toNumber(nutriments[`${key}_100g`]);
    const perServing = toNumber(nutriments[`${key}_serving`]);
    const hasValue = per100g !== null || perServing !== null;
    return { key, per100g, perServing, unit: resolveUnit(key, nutriments, hasValue) };
  });

  return {
    nutrients,
    servingSize: readText(product, 'serving_size'),
    hasPerServing: nutrients.some((nutrient) => nutrient.perServing !== null),
    nutriscoreGrade: normalizeGrade(readString(product, 'nutriscore_grade')),
    novaGroup: readNovaGroup(product),
    isEmpty: nutrients.every((nutrient) => nutrient.per100g === null && nutrient.perServing === null),
  };
}

function readText(product: OffProduct, key: string): string | null {
  const value = readString(product, key)?.trim();
  return value ? value : null;
}

function readAnyLanguage(product: OffProduct, baseKey: string): string | null {
  const prefix = `${baseKey}_`;
  const candidates = Object.keys(product)
    .filter((key) => key.startsWith(prefix) && LANGUAGE_SUFFIX.test(key.slice(prefix.length)))
    .sort();
  for (const key of candidates) {
    const value = readText(product, key);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

/**
 * Countries carry an ISO code alongside the display name so the UI can show a flag.
 *
 * The name still comes from the localized array and the code from the untranslated
 * one, which Open Food Facts keeps index-aligned. Where they are not aligned — a
 * missing or partial translation — the entry is dropped exactly as `cleanTags`
 * would have dropped it, so this never surfaces a raw `en:`-prefixed slug.
 */
export function readCountries(product: OffProduct, locale: Locale): CountryTag[] {
  const slugs = readStringArray(product, 'countries_tags') ?? [];
  const localized = readStringArray(product, `countries_tags_${locale}`) ?? [];
  const names = localized.length > 0 ? localized : slugs;

  const seen = new Set<string>();
  const countries: CountryTag[] = [];

  for (const [index, rawName] of names.entries()) {
    const name = rawName.trim();
    const fingerprint = name.toLowerCase();
    if (name === '' || UNTRANSLATED_TAG.test(name) || seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    countries.push({ name, code: countryCodeFromTag(slugs[index] ?? '') });
    if (countries.length === MAX_TAGS) {
      break;
    }
  }

  return countries;
}

/** Localized tag list (`categories_tags_nl`), falling back to the untranslated one. */
function readTags(product: OffProduct, baseKey: string, locale: Locale): string[] {
  const localized = cleanTags(readStringArray(product, `${baseKey}_${locale}`));
  return localized.length > 0 ? localized : cleanTags(readStringArray(product, baseKey));
}

function readNovaGroup(product: OffProduct): number | null {
  const value = toNumber(product.nova_group);
  return value === null ? null : Math.trunc(value);
}

function resolveUnit(key: NutrientKey, nutriments: Record<string, unknown>, hasValue: boolean): string | null {
  const unit = nutriments[`${key}_unit`];
  if (typeof unit === 'string' && unit.trim() !== '') {
    return unit.trim();
  }
  // Without a value there is nothing to qualify, so no unit is invented.
  return hasValue ? NUTRIENT_DEFAULT_UNITS[key] : null;
}

function collectMissing(checks: ReadonlyArray<readonly [string, boolean]>): string[] {
  return checks.filter(([, missing]) => missing).map(([field]) => field);
}

/**
 * OFF serves every product under a per-language subdomain (`nl.openfoodfacts.org`).
 * A base URL that is not the public site (a mirror, or a test stub) has no such
 * convention, so the canonical public host is used for the human-facing link.
 */
function localizedOffOrigin(locale: Locale, offBaseUrl: string): string {
  try {
    const base = new URL(offBaseUrl);
    if (base.hostname === PUBLIC_OFF_DOMAIN || base.hostname.endsWith(`.${PUBLIC_OFF_DOMAIN}`)) {
      return `${base.protocol}//${locale}.${PUBLIC_OFF_DOMAIN}`;
    }
  } catch {
    // Not a parseable URL - fall through to the canonical host.
  }
  return `https://${locale}.${PUBLIC_OFF_DOMAIN}`;
}
