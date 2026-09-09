import { NUTRIENT_KEYS, type Nutrient, type NutritionFacts, type ProductSummary } from '@/lib/types';

/** A well-filled product, the shape the mapper produces for a popular barcode. */
export function productSummary(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    barcode: '3017620422003',
    name: { value: 'Nutella hazelnut spread', source: 'requested' },
    brands: ['Ferrero', 'Nutella'],
    imageUrl: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.400.jpg',
    quantity: '400 g',
    nutriscoreGrade: 'e',
    missingFields: [],
    ...overrides,
  };
}

/** Everything Open Food Facts had nothing for — the common case for niche products. */
export function sparseProductSummary(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return productSummary({
    barcode: '0000000000017',
    name: { value: null, source: 'missing' },
    brands: [],
    imageUrl: null,
    quantity: null,
    nutriscoreGrade: null,
    missingFields: ['name', 'brands', 'imageUrl', 'quantity', 'nutriscoreGrade'],
    ...overrides,
  });
}

const PER_100G: Partial<Record<Nutrient['key'], { per100g: number | null; unit: string | null }>> = {
  'energy-kcal': { per100g: 539, unit: 'kcal' },
  fat: { per100g: 30.9, unit: 'g' },
  'saturated-fat': { per100g: 10.6, unit: 'g' },
  carbohydrates: { per100g: 57.5, unit: 'g' },
  sugars: { per100g: 56.3, unit: 'g' },
  fiber: { per100g: null, unit: 'g' },
  proteins: { per100g: 6.3, unit: 'g' },
  salt: { per100g: 0.107, unit: 'g' },
  sodium: { per100g: null, unit: 'g' },
};

/** All nine keys in the fixed order, with a couple of realistic gaps. */
export function nutritionFacts(overrides: Partial<NutritionFacts> = {}): NutritionFacts {
  const nutrients: Nutrient[] = NUTRIENT_KEYS.map((key) => {
    const entry = PER_100G[key] ?? { per100g: null, unit: null };
    return {
      key,
      per100g: entry.per100g,
      perServing: entry.per100g === null ? null : Math.round(entry.per100g * 0.15 * 100) / 100,
      unit: entry.unit,
    };
  });

  return {
    nutrients,
    servingSize: '15 g',
    hasPerServing: true,
    nutriscoreGrade: 'e',
    novaGroup: 4,
    isEmpty: false,
    ...overrides,
  };
}

/** What the backend returns when OFF has no `nutriments` block at all. */
export function emptyNutritionFacts(): NutritionFacts {
  return nutritionFacts({
    nutrients: NUTRIENT_KEYS.map((key) => ({ key, per100g: null, perServing: null, unit: null })),
    servingSize: null,
    hasPerServing: false,
    nutriscoreGrade: null,
    novaGroup: null,
    isEmpty: true,
  });
}
