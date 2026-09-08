import { Router } from 'express';
import { z } from 'zod';

import { badRequest } from '../lib/httpError';
import { logger } from '../lib/logger';
import { emptyToUndefined } from '../lib/zodHelpers';
import { requireSubscription } from '../middleware/requireSubscription';
import { getProductDetail, searchProducts } from '../services/productService';
import { recordSearch } from '../services/searchHistoryService';
import type { Locale, ProductResponse, SearchResponse } from '../types/api';

/**
 * Kept as a local literal tuple so zod infers the `Locale` union from it
 * instead of a widened `string`.
 */
const LOCALE_VALUES = ['en', 'nl', 'de', 'fr'] as const satisfies readonly Locale[];

const langSchema = z.preprocess(emptyToUndefined, z.enum(LOCALE_VALUES).default('en'));

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  lang: langSchema,
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(50).default(1)),
  pageSize: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(48).default(24)),
});

const productQuerySchema = z.object({ lang: langSchema });

const productParamsSchema = z.object({
  barcode: z.string().regex(/^\d{4,20}$/, 'Barcode must be 4 to 20 digits'),
});

export const productsRouter: Router = Router();

productsRouter.get('/', async (req, res) => {
  const { q, lang, page, pageSize } = parse(searchQuerySchema, req.query, 'Invalid search parameters');

  const result: SearchResponse = await searchProducts({ term: q, locale: lang, page, pageSize });

  // History is a nicety: never let it turn a successful search into an error.
  try {
    await recordSearch({ userId: req.user!.id, term: q, locale: lang, resultCount: result.total });
  } catch (error) {
    logger.warn('could not record search history', { term: q, error: describeError(error) });
  }

  res.json(result);
});

productsRouter.get('/:barcode', async (req, res) => {
  const { barcode } = parse(productParamsSchema, req.params, 'Invalid barcode');
  const { lang } = parse(productQuerySchema, req.query, 'Invalid query parameters');

  const { product, nutrition } = await getProductDetail({ barcode, locale: lang });
  const entitled = req.entitlements?.nutrition === true;

  // The paywall is enforced here rather than in the client: an unentitled
  // response must not carry a single nutrient number.
  const body: ProductResponse = {
    product,
    nutrition: entitled ? nutrition : null,
    nutritionLocked: !entitled,
    entitled,
  };

  res.json(body);
});

productsRouter.get('/:barcode/nutrition', requireSubscription, async (req, res) => {
  const { barcode } = parse(productParamsSchema, req.params, 'Invalid barcode');
  const { lang } = parse(productQuerySchema, req.query, 'Invalid query parameters');

  const { nutrition } = await getProductDetail({ barcode, locale: lang });

  res.json({ barcode, locale: lang, nutrition });
});

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest(message, z.flattenError(result.error));
  }
  return result.data;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
