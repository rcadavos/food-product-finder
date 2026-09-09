import { describe, expect, it } from 'vitest';
import {
  cleanTags,
  mapNutrition,
  mapProductDetail,
  mapProductSummary,
  normalizeGrade,
  pickImageUrl,
  resolveText,
  splitBrands,
  toNumber,
} from '../../src/services/openFoodFacts/mapper';
import type { OffProduct } from '../../src/services/openFoodFacts/types';
import { NUTRIENT_KEYS } from '../../src/types/api';
import { RICH_BARCODE, SPARSE_BARCODE, richProduct, sparseProduct } from '../helpers/offFixtures';

const OFF_BASE_URL = 'https://world.openfoodfacts.org';

describe('resolveText', () => {
  it('prefers the requested language', () => {
    const product: OffProduct = {
      product_name: 'Nutella',
      product_name_en: 'Hazelnut spread',
      product_name_de: 'Nuss-Nougat-Creme',
    };
    expect(resolveText(product, 'product_name', 'de')).toEqual({
      value: 'Nuss-Nougat-Creme',
      source: 'requested',
    });
  });

  it('falls back to the product default field', () => {
    const product: OffProduct = { product_name: 'Nutella' };
    expect(resolveText(product, 'product_name', 'de')).toEqual({
      value: 'Nutella',
      source: 'default',
    });
  });

  it('falls back to English before any other language', () => {
    const product: OffProduct = {
      product_name_en: 'Hazelnut spread',
      product_name_it: 'Crema alla nocciola',
    };
    expect(resolveText(product, 'product_name', 'de')).toEqual({
      value: 'Hazelnut spread',
      source: 'english',
    });
  });

  it('falls back to whatever language is present as a last resort', () => {
    const product: OffProduct = { product_name_it: 'Crema alla nocciola' };
    expect(resolveText(product, 'product_name', 'de')).toEqual({
      value: 'Crema alla nocciola',
      source: 'other',
    });
  });

  it('reports missing when nothing usable exists', () => {
    const product: OffProduct = { product_name: '   ', product_name_de: '' };
    expect(resolveText(product, 'product_name', 'de')).toEqual({ value: null, source: 'missing' });
  });

  it('does not mistake a non-language suffix for a translation', () => {
    const product: OffProduct = { ingredients_text_with_allergens: 'Sugar, milk' };
    expect(resolveText(product, 'ingredients_text', 'nl')).toEqual({
      value: null,
      source: 'missing',
    });
  });

  it('treats an English request for an English-only field as the requested language', () => {
    const product: OffProduct = { product_name_en: 'Hazelnut spread' };
    expect(resolveText(product, 'product_name', 'en').source).toBe('requested');
  });
});

describe('splitBrands', () => {
  it('trims, de-duplicates case-insensitively and drops empties', () => {
    expect(splitBrands(' Ferrero, Nutella ,, ferrero ')).toEqual(['Ferrero', 'Nutella']);
  });

  it('returns an empty array for missing input', () => {
    expect(splitBrands(undefined)).toEqual([]);
    expect(splitBrands('')).toEqual([]);
  });
});

describe('cleanTags', () => {
  it('drops tags Open Food Facts never translated', () => {
    expect(cleanTags(['Brotaufstriche', 'en:spreads', 'fr:pates-a-tartiner'])).toEqual([
      'Brotaufstriche',
    ]);
  });

  it('de-duplicates and caps the list at twelve entries', () => {
    const many = Array.from({ length: 20 }, (_, index) => `Tag ${index}`);
    expect(cleanTags(many)).toHaveLength(12);
    expect(cleanTags(['Spreads', 'spreads', '  Spreads  '])).toEqual(['Spreads']);
  });

  it('tolerates a missing list', () => {
    expect(cleanTags(undefined)).toEqual([]);
  });
});

describe('normalizeGrade', () => {
  it('maps Open Food Facts placeholders to null', () => {
    expect(normalizeGrade('unknown')).toBeNull();
    expect(normalizeGrade('not-applicable')).toBeNull();
    expect(normalizeGrade('  ')).toBeNull();
    expect(normalizeGrade(undefined)).toBeNull();
  });

  it('lowercases a real grade', () => {
    expect(normalizeGrade(' A ')).toBe('a');
  });
});

describe('pickImageUrl and toNumber', () => {
  it('picks the first usable absolute image url', () => {
    expect(pickImageUrl({ image_front_url: '   ', image_url: 'https://img.test/a.jpg' })).toBe(
      'https://img.test/a.jpg',
    );
    expect(pickImageUrl({ image_url: '/relative/a.jpg' })).toBeNull();
    expect(pickImageUrl({})).toBeNull();
  });

  it('accepts numeric strings and rejects everything unusable', () => {
    expect(toNumber('3.4')).toBe(3.4);
    expect(toNumber(0)).toBe(0);
    expect(toNumber('')).toBeNull();
    expect(toNumber('abc')).toBeNull();
    expect(toNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
});

describe('mapProductSummary', () => {
  it('maps a fully populated product', () => {
    const summary = mapProductSummary(richProduct(), 'de');

    expect(summary).toMatchObject({
      barcode: RICH_BARCODE,
      name: { value: 'Nutella Nuss-Nougat-Creme', source: 'requested' },
      brands: ['Ferrero', 'Nutella'],
      quantity: '400 g',
      nutriscoreGrade: 'e',
      missingFields: [],
    });
    expect(summary.imageUrl).toMatch(/^https:\/\/images\.openfoodfacts\.org\//);
  });

  it('maps a product that only has a barcode without throwing', () => {
    const summary = mapProductSummary(sparseProduct(), 'nl');

    expect(summary.barcode).toBe(SPARSE_BARCODE);
    expect(summary.name).toEqual({ value: null, source: 'missing' });
    expect(summary.brands).toEqual([]);
    expect(summary.imageUrl).toBeNull();
    expect(summary.missingFields).toEqual([
      'name',
      'brands',
      'imageUrl',
      'quantity',
      'nutriscoreGrade',
    ]);
  });
});

describe('mapProductDetail', () => {
  it('uses the localized tag lists and drops untranslated leftovers', () => {
    const detail = mapProductDetail(richProduct(), 'de', OFF_BASE_URL);

    expect(detail.categories).toEqual(['Brotaufstriche', 'Süße Brotaufstriche']);
    expect(detail.allergens).toEqual(['Milch', 'Nüsse', 'Sojabohnen']);
    // The name comes from the localized array, the ISO code from the untranslated one.
    expect(detail.countries).toEqual([
      { name: 'Deutschland', code: 'DE' },
      { name: 'Frankreich', code: 'FR' },
    ]);
    expect(detail.ingredientsText.source).toBe('requested');
    expect(detail.genericName).toEqual({ value: 'Nuss-Nougat-Creme', source: 'requested' });
    expect(detail.novaGroup).toBe(4);
    expect(detail.ecoscoreGrade).toBe('d');
    expect(detail.servingSize).toBe('15 g');
    expect(detail.sourceUrl).toBe(`https://de.openfoodfacts.org/product/${RICH_BARCODE}`);
    expect(detail.missingFields).toEqual([]);
  });

  it('reports the extra detail-only fields as missing on a sparse product', () => {
    const detail = mapProductDetail(sparseProduct(), 'fr', OFF_BASE_URL);

    expect(detail.missingFields).toEqual([
      'name',
      'brands',
      'imageUrl',
      'quantity',
      'nutriscoreGrade',
      'ingredientsText',
      'categories',
    ]);
    expect(detail.categories).toEqual([]);
    expect(detail.sourceUrl).toBe(`https://fr.openfoodfacts.org/product/${SPARSE_BARCODE}`);
  });
});

describe('mapNutrition', () => {
  it('returns every nutrient key in order with values and units', () => {
    const nutrition = mapNutrition(richProduct());

    expect(nutrition.nutrients.map((nutrient) => nutrient.key)).toEqual([...NUTRIENT_KEYS]);
    expect(nutrition.nutrients[0]).toEqual({
      key: 'energy-kcal',
      per100g: 539,
      perServing: 80.9,
      unit: 'kcal',
    });
    // `fiber_100g` arrives as the string '3.4' and carries no unit of its own.
    expect(nutrition.nutrients.find((nutrient) => nutrient.key === 'fiber')).toEqual({
      key: 'fiber',
      per100g: 3.4,
      perServing: null,
      unit: 'g',
    });
    expect(nutrition.hasPerServing).toBe(true);
    expect(nutrition.servingSize).toBe('15 g');
    expect(nutrition.nutriscoreGrade).toBe('e');
    expect(nutrition.novaGroup).toBe(4);
    expect(nutrition.isEmpty).toBe(false);
  });

  it('reports isEmpty for a product without nutriments', () => {
    const nutrition = mapNutrition(sparseProduct());

    expect(nutrition.isEmpty).toBe(true);
    expect(nutrition.hasPerServing).toBe(false);
    expect(nutrition.nutrients).toHaveLength(NUTRIENT_KEYS.length);
    expect(
      nutrition.nutrients.every(
        (nutrient) =>
          nutrient.per100g === null && nutrient.perServing === null && nutrient.unit === null,
      ),
    ).toBe(true);
  });
});

describe('readCountries', () => {
  it('pairs each localized country name with its ISO code', () => {
    const detail = mapProductDetail(richProduct(), 'en', OFF_BASE_URL);

    expect(detail.countries).toEqual([
      { name: 'Germany', code: 'DE' },
      { name: 'France', code: 'FR' },
    ]);
  });

  it('keeps the country when the slug is one we do not map', () => {
    const product = {
      ...richProduct(),
      countries_tags: ['en:france', 'en:narnia'],
      countries_tags_en: ['France', 'Narnia'],
    };

    // A missing flag must not cost the visitor the country name itself.
    expect(mapProductDetail(product, 'en', OFF_BASE_URL).countries).toEqual([
      { name: 'France', code: 'FR' },
      { name: 'Narnia', code: null },
    ]);
  });

  it('drops entries OFF could not translate rather than showing a raw slug', () => {
    const product = {
      ...richProduct(),
      countries_tags: ['en:germany', 'en:france'],
      countries_tags_de: ['Deutschland', 'en:france'],
    };

    expect(mapProductDetail(product, 'de', OFF_BASE_URL).countries).toEqual([
      { name: 'Deutschland', code: 'DE' },
    ]);
  });

  it('returns an empty list when the product names no country', () => {
    expect(mapProductDetail(sparseProduct(), 'en', OFF_BASE_URL).countries).toEqual([]);
  });
});
