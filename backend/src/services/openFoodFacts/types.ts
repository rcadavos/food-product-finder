/**
 * Raw Open Food Facts payload shapes.
 *
 * Every field is optional: OFF is a crowdsourced database and any product may
 * be missing almost anything. Language-suffixed keys (`product_name_nl`,
 * `categories_tags_de`, ...) are open-ended, so the shapes carry a
 * `Record<string, unknown>` index signature and those keys are read through the
 * narrowing helpers below instead of being enumerated in the type.
 */

export type OffNutriments = Record<string, unknown>;

export type OffProduct = {
  code?: string;
  product_name?: string;
  generic_name?: string;
  ingredients_text?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  image_front_url?: string;
  image_front_small_url?: string;
  image_url?: string;
  nutriscore_grade?: string;
  ecoscore_grade?: string;
  nova_group?: number | string;
  nutriments?: OffNutriments;
  categories_tags?: string[];
  labels_tags?: string[];
  allergens_tags?: string[];
  countries_tags?: string[];
} & Record<string, unknown>;

/** Response of the v1 `cgi/search.pl` endpoint. */
export type OffSearchResponse = {
  /** OFF returns the paging numbers as either numbers or numeric strings. */
  count?: number | string;
  page?: number | string;
  /** Despite the name, the number of products in *this* page, not of pages. */
  page_count?: number | string;
  page_size?: number | string;
  skip?: number | string;
  products?: OffProduct[];
} & Record<string, unknown>;

/** Response of the v2 `api/v2/product/{barcode}.json` endpoint. */
export type OffProductResponse = {
  code?: string;
  /** 1 = found, 0 = unknown barcode. */
  status?: number | string;
  status_verbose?: string;
  product?: OffProduct;
} & Record<string, unknown>;

export function readString(product: OffProduct, key: string): string | undefined {
  const value = product[key];
  return typeof value === 'string' ? value : undefined;
}

export function readStringArray(product: OffProduct, key: string): string[] {
  const value = product[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function readRecord(product: OffProduct, key: string): Record<string, unknown> {
  const value = product[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}
