/**
 * GET /api/products/:barcode — product detail, including the server-side
 * paywall: an unentitled response must not contain a nutrient number anywhere.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../src/lib/prisma', async () => {
  const { prismaMock } = await import('../helpers/prismaMock');
  return { prisma: prismaMock, disconnectPrisma: vi.fn() };
});

vi.mock('../../src/lib/stripe', async () => {
  const { STRIPE_LOCALES, stripeMock } = await import('../helpers/stripeMock');
  return { stripe: stripeMock, STRIPE_LOCALES };
});

import { NUTRIENT_KEYS, type ProductResponse } from '../../src/types/api';
import { resetBackendState, testAgent } from '../helpers/app';
import {
  MISSING_BARCODE,
  RICH_BARCODE,
  RICH_ENERGY_KCAL_100G,
  RICH_SUGARS_100G,
  SPARSE_BARCODE,
  jsonResponse,
  productMissResponse,
  productResponse,
  sparseProduct,
} from '../helpers/offFixtures';
import { giveActiveSubscription } from '../helpers/prismaMock';

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = resetBackendState();
});

describe('GET /api/products/:barcode', () => {
  it('answers 404 NOT_FOUND when Open Food Facts reports status 0', async () => {
    fetchMock.mockResolvedValue(jsonResponse(productMissResponse()));

    const response = await testAgent().get(`/api/products/${MISSING_BARCODE}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.product).toBeUndefined();
  });

  it('answers 400 VALIDATION_ERROR for a barcode that is not digits', async () => {
    const response = await testAgent().get('/api/products/not-a-barcode');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    // Rejected before any upstream call is made.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the public fields with nutrition withheld when the caller is not entitled', async () => {
    fetchMock.mockResolvedValue(jsonResponse(productResponse()));

    const response = await testAgent().get(`/api/products/${RICH_BARCODE}`).query({ lang: 'de' });

    expect(response.status).toBe(200);
    const body = response.body as ProductResponse;
    expect(body.entitled).toBe(false);
    expect(body.nutritionLocked).toBe(true);
    expect(body.nutrition).toBeNull();

    // The public half of the payload is still complete and localized.
    expect(body.product.barcode).toBe(RICH_BARCODE);
    expect(body.product.name).toEqual({
      value: 'Nutella Nuss-Nougat-Creme',
      source: 'requested',
    });
    expect(body.product.brands).toEqual(['Ferrero', 'Nutella']);
    expect(body.product.nutriscoreGrade).toBe('e');
    expect(body.product.novaGroup).toBe(4);
    expect(body.product.sourceUrl).toBe(`https://de.openfoodfacts.org/product/${RICH_BARCODE}`);
    expect(body.product.categories).toEqual(['Brotaufstriche', 'Süße Brotaufstriche']);
  });

  it('serializes no nutrient number at all for an unentitled caller', async () => {
    fetchMock.mockResolvedValue(jsonResponse(productResponse()));

    const response = await testAgent().get(`/api/products/${RICH_BARCODE}`);

    expect(response.status).toBe(200);
    const raw = response.text;
    expect(typeof raw).toBe('string');
    expect(raw.length).toBeGreaterThan(0);

    // The security assertion: the raw bytes on the wire, not just the parsed body.
    expect(raw).not.toContain(String(RICH_ENERGY_KCAL_100G));
    expect(raw).not.toContain(String(RICH_SUGARS_100G));
    expect(raw).not.toContain('30.9');
    expect(raw).not.toContain('10.6');
    expect(raw).not.toContain('nutrients');
    expect(raw).not.toContain('per100g');
    expect(raw).not.toContain('perServing');
    expect(raw).toContain('"nutrition":null');
  });

  it('returns all nine nutrients, in order, to an entitled caller', async () => {
    giveActiveSubscription();
    fetchMock.mockResolvedValue(jsonResponse(productResponse()));

    const response = await testAgent().get(`/api/products/${RICH_BARCODE}`);

    expect(response.status).toBe(200);
    const body = response.body as ProductResponse;
    expect(body.entitled).toBe(true);
    expect(body.nutritionLocked).toBe(false);
    expect(body.nutrition).not.toBeNull();

    const nutrition = body.nutrition!;
    expect(nutrition.nutrients.map((nutrient) => nutrient.key)).toEqual([...NUTRIENT_KEYS]);
    expect(nutrition.nutrients[0]).toEqual({
      key: 'energy-kcal',
      per100g: RICH_ENERGY_KCAL_100G,
      perServing: 80.9,
      unit: 'kcal',
    });
    // OFF sent fibre as a numeric string and without a unit.
    expect(nutrition.nutrients.find((nutrient) => nutrient.key === 'fiber')).toEqual({
      key: 'fiber',
      per100g: 3.4,
      perServing: null,
      unit: 'g',
    });
    expect(nutrition.servingSize).toBe('15 g');
    expect(nutrition.hasPerServing).toBe(true);
    expect(nutrition.isEmpty).toBe(false);
    expect(response.text).toContain(String(RICH_ENERGY_KCAL_100G));
  });

  it('answers 200 and lists the missing fields for a product Open Food Facts barely knows', async () => {
    fetchMock.mockResolvedValue(jsonResponse(productResponse(sparseProduct())));

    const response = await testAgent().get(`/api/products/${SPARSE_BARCODE}`);

    expect(response.status).toBe(200);
    const body = response.body as ProductResponse;
    expect(body.product.barcode).toBe(SPARSE_BARCODE);
    expect(body.product.name).toEqual({ value: null, source: 'missing' });
    expect(body.product.missingFields).toEqual([
      'name',
      'brands',
      'imageUrl',
      'quantity',
      'nutriscoreGrade',
      'ingredientsText',
      'categories',
    ]);
    expect(body.product.categories).toEqual([]);
    expect(body.product.sourceUrl).toBe(`https://en.openfoodfacts.org/product/${SPARSE_BARCODE}`);
  });

  it('reports an empty nutrition table for a product without nutriments', async () => {
    giveActiveSubscription();
    fetchMock.mockResolvedValue(jsonResponse(productResponse(sparseProduct())));

    const response = await testAgent().get(`/api/products/${SPARSE_BARCODE}`);

    expect(response.status).toBe(200);
    const nutrition = (response.body as ProductResponse).nutrition!;
    expect(nutrition.isEmpty).toBe(true);
    expect(nutrition.hasPerServing).toBe(false);
    expect(nutrition.nutrients).toHaveLength(9);
    expect(nutrition.nutrients.every((nutrient) => nutrient.per100g === null)).toBe(true);
  });
});
