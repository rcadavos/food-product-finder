/**
 * Realistic Open Food Facts payloads.
 *
 * Everything is exposed through factory functions that return a deep clone, so
 * a test that pokes at a fixture cannot leak that change into the next one.
 * The fixtures intentionally include the mess real OFF data has: duplicated
 * brands, tags that were never translated (`en:spreads` inside a German list),
 * numeric strings, and a product with nothing but a barcode.
 */

import { vi, type Mock } from 'vitest';
import type { OffProduct, OffProductResponse, OffSearchResponse } from '../../src/services/openFoodFacts/types';

export const RICH_BARCODE = '3017620422003';
export const SPARSE_BARCODE = '1234567890123';
export const MISSING_BARCODE = '9999999999999';

/** Per-100 g energy of the rich fixture; used to prove locked payloads leak nothing. */
export const RICH_ENERGY_KCAL_100G = 539;
export const RICH_SUGARS_100G = 56.3;

const RICH_PRODUCT: OffProduct = {
  code: RICH_BARCODE,
  product_name: 'Nutella',
  product_name_en: 'Nutella hazelnut spread',
  product_name_de: 'Nutella Nuss-Nougat-Creme',
  product_name_fr: 'Nutella pâte à tartiner aux noisettes',
  generic_name: 'Hazelnut spread with cocoa',
  generic_name_de: 'Nuss-Nougat-Creme',
  ingredients_text:
    'Sugar, palm oil, hazelnuts 13%, skimmed milk powder 8.7%, fat-reduced cocoa 7.4%, emulsifier: lecithins (soya), vanillin.',
  ingredients_text_de:
    'Zucker, Palmöl, Haselnüsse 13%, Magermilchpulver 8,7%, fettarmer Kakao 7,4%, Emulgator: Lecithine (Soja), Vanillin.',
  brands: 'Ferrero, Nutella, ferrero',
  quantity: '400 g',
  serving_size: '15 g',
  image_front_url:
    'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_de.400.jpg',
  image_front_small_url:
    'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_de.200.jpg',
  image_url: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_de.400.jpg',
  nutriscore_grade: 'e',
  ecoscore_grade: 'd',
  nova_group: 4,
  nutriments: {
    'energy-kcal_100g': RICH_ENERGY_KCAL_100G,
    'energy-kcal_serving': 80.9,
    'energy-kcal_unit': 'kcal',
    fat_100g: 30.9,
    fat_serving: 4.64,
    fat_unit: 'g',
    'saturated-fat_100g': 10.6,
    'saturated-fat_serving': 1.59,
    'saturated-fat_unit': 'g',
    carbohydrates_100g: 57.5,
    carbohydrates_serving: 8.63,
    carbohydrates_unit: 'g',
    sugars_100g: RICH_SUGARS_100G,
    sugars_serving: 8.45,
    sugars_unit: 'g',
    // OFF frequently returns numbers as strings, and often without a unit.
    fiber_100g: '3.4',
    proteins_100g: 6.3,
    proteins_serving: 0.945,
    proteins_unit: 'g',
    salt_100g: 0.107,
    salt_serving: 0.016,
    salt_unit: 'g',
    sodium_100g: 0.0428,
    sodium_serving: 0.0064,
    sodium_unit: 'g',
  },
  categories_tags: ['en:spreads', 'en:sweet-spreads', 'en:cocoa-and-hazelnuts-spreads'],
  categories_tags_en: ['Spreads', 'Sweet spreads', 'Cocoa and hazelnuts spreads'],
  // A list OFF only partly translated - `en:spreads` must be dropped.
  categories_tags_de: ['Brotaufstriche', 'Süße Brotaufstriche', 'en:spreads'],
  labels_tags: ['en:no-gluten', 'en:palm-oil'],
  labels_tags_en: ['No gluten', 'Palm oil'],
  labels_tags_de: ['Glutenfrei', 'Palmöl'],
  allergens_tags: ['en:milk', 'en:nuts', 'en:soybeans'],
  allergens_tags_en: ['Milk', 'Nuts', 'Soybeans'],
  allergens_tags_de: ['Milch', 'Nüsse', 'Sojabohnen'],
  countries_tags: ['en:germany', 'en:france'],
  countries_tags_en: ['Germany', 'France'],
  countries_tags_de: ['Deutschland', 'Frankreich'],
};

/** The realistic worst case: a barcode somebody scanned and never filled in. */
const SPARSE_PRODUCT: OffProduct = { code: SPARSE_BARCODE };

const SEARCH_HIT: OffProduct = {
  code: '5449000000996',
  product_name: 'Coca-Cola',
  product_name_nl: 'Coca-Cola Regular',
  brands: 'Coca-Cola',
  quantity: '1.5 l',
  image_front_url: 'https://images.openfoodfacts.org/images/products/544/900/000/0996/front_nl.400.jpg',
  nutriscore_grade: 'e',
};

export function richProduct(): OffProduct {
  return structuredClone(RICH_PRODUCT);
}

export function sparseProduct(): OffProduct {
  return structuredClone(SPARSE_PRODUCT);
}

export function productResponse(product: OffProduct = richProduct()): OffProductResponse {
  return { code: typeof product.code === 'string' ? product.code : '', status: 1, product };
}

/** What OFF answers for an unknown barcode: HTTP 200 with `status: 0`. */
export function productMissResponse(barcode = MISSING_BARCODE): OffProductResponse {
  return { code: barcode, status: 0, status_verbose: 'product not found' };
}

export function searchResponse(): OffSearchResponse {
  return {
    count: 57,
    page: 1,
    page_count: 3,
    page_size: 24,
    skip: 0,
    products: [
      structuredClone(SEARCH_HIT),
      structuredClone(SPARSE_PRODUCT),
      // No barcode at all: unlinkable, so the service must drop it.
      { product_name: 'Mystery item without a code' },
    ],
  };
}

export function emptySearchResponse(): OffSearchResponse {
  return { count: 0, page: 1, page_count: 0, page_size: 24, skip: 0, products: [] };
}

/** A `fetch` result carrying JSON; only the members the client touches exist. */
export function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

/** OFF answers some malformed requests with an HTML error page. */
export function htmlResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    },
  } as unknown as Response;
}

/** What `AbortSignal.timeout()` rejects the fetch with. */
export function timeoutError(): Error {
  const error = new Error('The operation was aborted due to timeout');
  error.name = 'TimeoutError';
  return error;
}

/** Replaces the global `fetch` with a fresh mock and hands it back. */
export function installFetchMock(): Mock {
  const mock = vi.fn();
  vi.stubGlobal('fetch', mock);
  return mock;
}
