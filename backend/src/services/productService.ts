/**
 * Orchestrates the Open Food Facts client and mappers into the shapes the HTTP
 * layer returns. Deliberately free of persistence: recording search history is
 * the route's job, so a database hiccup can never break a product lookup.
 */

import { env } from '../config/env';
import { notFound } from '../lib/httpError';
import { logger } from '../lib/logger';
import type { Locale, NutritionFacts, ProductDetail, SearchResponse } from '../types/api';
import { getProduct, searchProducts as searchOff } from './openFoodFacts/client';
import { mapNutrition, mapProductDetail, mapProductSummary, toNumber } from './openFoodFacts/mapper';

export interface SearchProductsParams {
  term: string;
  locale: Locale;
  page: number;
  pageSize: number;
}

export interface ProductDetailParams {
  barcode: string;
  locale: Locale;
}

export interface ProductDetailResult {
  product: ProductDetail;
  nutrition: NutritionFacts;
}

export async function searchProducts({
  term,
  locale,
  page,
  pageSize,
}: SearchProductsParams): Promise<SearchResponse> {
  const response = await searchOff({ term, locale, page, pageSize });

  // A product without a barcode cannot be linked to, so it is not offered.
  const products = (response.products ?? [])
    .map((product) => mapProductSummary(product, locale))
    .filter((product) => product.barcode !== '');

  const total = Math.max(0, Math.trunc(toNumber(response.count) ?? products.length));
  // Paging is derived from the total alone: OFF's `page_count` is the number of
  // products in the page it just returned, not the number of pages available.
  const hasMore = products.length > 0 && page * pageSize < total;

  return { query: term, locale, page, pageSize, total, hasMore, products };
}

export async function getProductDetail({
  barcode,
  locale,
}: ProductDetailParams): Promise<ProductDetailResult> {
  const response = await getProduct({ barcode, locale });

  if (toNumber(response.status) !== 1 || !response.product) {
    logger.debug('open food facts has no such product', { barcode, status: response.status });
    throw notFound();
  }

  return {
    product: mapProductDetail(response.product, locale, env.OFF_BASE_URL),
    nutrition: mapNutrition(response.product),
  };
}
