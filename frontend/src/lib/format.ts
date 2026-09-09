/**
 * Locale-aware formatting helpers built on `Intl` only — no date library.
 *
 * Everything here is fed by Open Food Facts data, which is patchy by nature, so every
 * function tolerates null, undefined and garbage input and returns a display string
 * instead of throwing. `Intl` also throws `RangeError` on malformed locale tags, which
 * is why the constructors are wrapped.
 */

/** Em dash: the single "no value" marker used across the UI. */
const DASH = '—';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 604_800_000;
const MONTH_MS = 2_592_000_000;

const RELATIVE_UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['second', 1000],
  ['minute', MINUTE_MS],
  ['hour', HOUR_MS],
  ['day', DAY_MS],
  ['week', WEEK_MS],
];

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clampDigits(digits: number): number {
  if (!Number.isFinite(digits)) return 1;
  return Math.min(20, Math.max(0, Math.trunc(digits)));
}

export function formatNumber(
  value: number | null | undefined,
  locale: string,
  maxFractionDigits = 1,
): string {
  const num = toFiniteNumber(value);
  if (num === null) return DASH;

  try {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: clampDigits(maxFractionDigits),
    }).format(num);
  } catch {
    return String(num);
  }
}

/**
 * Nutrient amounts span three orders of magnitude (2255 kcal down to 0.03 g of salt),
 * so precision scales with size rather than being fixed.
 */
export function formatNutrientValue(
  value: number | null | undefined,
  unit: string | null | undefined,
  locale: string,
): string {
  const num = toFiniteNumber(value);
  if (num === null) return DASH;

  const magnitude = Math.abs(num);
  const digits = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2;
  const suffix = typeof unit === 'string' && unit.trim() !== '' ? ` ${unit.trim()}` : '';

  return `${formatNumber(num, locale, digits)}${suffix}`;
}

export function formatDate(iso: string | null | undefined, locale: string): string {
  const date = toDate(iso);
  if (date === null) return DASH;

  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * "3 minutes ago" for anything within the last month, an absolute date beyond that —
 * "5 weeks ago" is harder to read than the day itself.
 */
export function formatRelativeDate(
  iso: string | null | undefined,
  locale: string,
  now: Date = new Date(),
): string {
  const date = toDate(iso);
  if (date === null) return DASH;

  const diffMs = date.getTime() - now.getTime();
  if (Math.abs(diffMs) >= MONTH_MS) return formatDate(iso, locale);

  try {
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    let unit: Intl.RelativeTimeFormatUnit = 'second';
    let unitMs = 1000;
    for (const [candidate, size] of RELATIVE_UNITS) {
      if (Math.abs(diffMs) >= size) {
        unit = candidate;
        unitMs = size;
      }
    }
    return formatter.format(Math.round(diffMs / unitMs), unit);
  } catch {
    return formatDate(iso, locale);
  }
}

/**
 * Open Food Facts tags arrive as `en:breakfast-cereals` or `plant-based-foods`. The
 * language prefix only survives on entries the community has not translated yet.
 *
 * Sentence case, not title case: Open Food Facts already returns localized tags with the
 * casing their own language wants, and capitalising every word turns "Produits laitiers"
 * into "Produits Laitiers" and "Lebensmittel und Getränke" into "Lebensmittel Und Getränke".
 * Only the first character is touched, so acronyms and German nouns survive untouched.
 */
export function titleCase(tag: string | null | undefined): string {
  if (typeof tag !== 'string') return '';

  const text = tag
    .replace(/^[a-z]{2,3}:/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  return text.charAt(0).toUpperCase() + text.slice(1);
}
