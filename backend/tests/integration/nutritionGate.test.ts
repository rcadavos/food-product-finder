/**
 * GET /api/products/:barcode/nutrition — the second enforcement point for the
 * paywall. The route is guarded by `requireSubscription`, so an unentitled
 * caller must be turned away before Open Food Facts is even consulted.
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

import { SubscriptionStatus } from '../../src/generated/prisma/enums';
import { NUTRIENT_KEYS, type NutritionFacts } from '../../src/types/api';
import { resetBackendState, testAgent } from '../helpers/app';
import {
  RICH_BARCODE,
  RICH_ENERGY_KCAL_100G,
  RICH_SUGARS_100G,
  jsonResponse,
  productResponse,
} from '../helpers/offFixtures';
import { giveActiveSubscription } from '../helpers/prismaMock';

interface NutritionRouteBody {
  barcode: string;
  locale: string;
  nutrition: NutritionFacts;
}

const HOUR_MS = 60 * 60 * 1000;

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = resetBackendState();
  fetchMock.mockResolvedValue(jsonResponse(productResponse()));
});

describe('GET /api/products/:barcode/nutrition', () => {
  it('answers 402 SUBSCRIPTION_REQUIRED without an active subscription', async () => {
    const response = await testAgent().get(`/api/products/${RICH_BARCODE}/nutrition`);

    expect(response.status).toBe(402);
    expect(response.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(response.body.nutrition).toBeUndefined();

    // Not one nutrient number reaches the wire, and the upstream is never hit.
    expect(response.text).not.toContain(String(RICH_ENERGY_KCAL_100G));
    expect(response.text).not.toContain(String(RICH_SUGARS_100G));
    expect(response.text).not.toContain('nutrients');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the full nutrition facts to a subscriber', async () => {
    giveActiveSubscription();

    const response = await testAgent()
      .get(`/api/products/${RICH_BARCODE}/nutrition`)
      .query({ lang: 'de' });

    expect(response.status).toBe(200);
    const body = response.body as NutritionRouteBody;
    expect(body.barcode).toBe(RICH_BARCODE);
    expect(body.locale).toBe('de');
    expect(body.nutrition.nutrients.map((nutrient) => nutrient.key)).toEqual([...NUTRIENT_KEYS]);
    expect(body.nutrition.nutrients[0]).toEqual({
      key: 'energy-kcal',
      per100g: RICH_ENERGY_KCAL_100G,
      perServing: 80.9,
      unit: 'kcal',
    });
    expect(body.nutrition.servingSize).toBe('15 g');
    expect(body.nutrition.hasPerServing).toBe(true);
    expect(body.nutrition.nutriscoreGrade).toBe('e');
    expect(body.nutrition.novaGroup).toBe(4);
    expect(body.nutrition.isEmpty).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lets a trialing subscription through', async () => {
    giveActiveSubscription({ status: SubscriptionStatus.TRIALING });

    const response = await testAgent().get(`/api/products/${RICH_BARCODE}/nutrition`);

    expect(response.status).toBe(200);
    expect((response.body as NutritionRouteBody).nutrition.nutrients).toHaveLength(9);
  });

  it('keeps the gate closed when the billing period has already ended', async () => {
    giveActiveSubscription({
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date(Date.now() - HOUR_MS),
    });

    const response = await testAgent().get(`/api/products/${RICH_BARCODE}/nutrition`);

    expect(response.status).toBe(402);
    expect(response.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the gate closed for a past-due subscription that is still inside its period', async () => {
    giveActiveSubscription({
      status: SubscriptionStatus.PAST_DUE,
      currentPeriodEnd: new Date(Date.now() + HOUR_MS),
    });

    const response = await testAgent().get(`/api/products/${RICH_BARCODE}/nutrition`);

    expect(response.status).toBe(402);
    expect(response.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('unlocks a subscription that carries no period end at all', async () => {
    giveActiveSubscription({ currentPeriodEnd: null });

    const response = await testAgent().get(`/api/products/${RICH_BARCODE}/nutrition`);

    expect(response.status).toBe(200);
    expect((response.body as NutritionRouteBody).nutrition.isEmpty).toBe(false);
  });
});
