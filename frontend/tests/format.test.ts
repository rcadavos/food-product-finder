import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatDate,
  formatNumber,
  formatNutrientValue,
  formatRelativeDate,
  titleCase,
} from '@/lib/format';

/** The em dash the UI uses everywhere for "Open Food Facts had nothing here". */
const DASH = '—';

/** Midday UTC, so the calendar day survives the machine's timezone offset. */
const ISO = '2026-01-15T12:00:00.000Z';

/**
 * The API is typed, but values that travel through untyped JSON have arrived as
 * strings before; format.ts guards against that deliberately, so the guard is tested.
 */
function asNumber(value: unknown): number | null | undefined {
  return value as number | null | undefined;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('formatNutrientValue', () => {
  it('renders the em dash placeholder when there is no value', () => {
    expect(formatNutrientValue(null, 'g', 'en')).toBe(DASH);
    expect(formatNutrientValue(undefined, 'g', 'en')).toBe(DASH);
    expect(formatNutrientValue(Number.NaN, 'g', 'en')).toBe(DASH);
    expect(formatNutrientValue(Number.POSITIVE_INFINITY, 'g', 'en')).toBe(DASH);
  });

  it('appends the unit after the number', () => {
    expect(formatNutrientValue(30.9, 'g', 'en')).toBe('30.9 g');
    expect(formatNutrientValue(539, 'kcal', 'en')).toBe('539 kcal');
  });

  it('writes the decimal separator as a comma in Dutch and German and a dot in English', () => {
    expect(formatNutrientValue(56.3, 'g', 'en')).toBe('56.3 g');
    expect(formatNutrientValue(56.3, 'g', 'nl')).toBe('56,3 g');
    expect(formatNutrientValue(56.3, 'g', 'de')).toBe('56,3 g');
  });

  it('scales precision with magnitude so 2255 kcal and 0.107 g both stay readable', () => {
    expect(formatNutrientValue(2255.4, 'kcal', 'en')).toBe('2,255 kcal');
    expect(formatNutrientValue(30.94, 'g', 'en')).toBe('30.9 g');
    expect(formatNutrientValue(0.107, 'g', 'en')).toBe('0.11 g');
  });

  it('omits the suffix when the unit is missing or blank, and trims a padded one', () => {
    expect(formatNutrientValue(12, null, 'en')).toBe('12');
    expect(formatNutrientValue(12, '   ', 'en')).toBe('12');
    expect(formatNutrientValue(12, ' g ', 'en')).toBe('12 g');
  });
});

describe('formatNumber', () => {
  it('honours maxFractionDigits', () => {
    expect(formatNumber(1234.5678, 'en', 2)).toBe('1,234.57');
    expect(formatNumber(1234.5678, 'en', 0)).toBe('1,235');
    expect(formatNumber(1234.5678, 'en', 3)).toBe('1,234.568');
  });

  it('defaults to a single fraction digit', () => {
    expect(formatNumber(2.345, 'en')).toBe('2.3');
  });

  it('groups thousands the way the locale does', () => {
    expect(formatNumber(2255, 'en', 0)).toBe('2,255');
    expect(formatNumber(2255, 'de', 0)).toBe('2.255');
    expect(formatNumber(2255, 'nl', 0)).toBe('2.255');
  });

  it('returns the placeholder instead of NaN for absent or non-finite input', () => {
    expect(formatNumber(null, 'en')).toBe(DASH);
    expect(formatNumber(undefined, 'en')).toBe(DASH);
    expect(formatNumber(Number.NaN, 'en')).toBe(DASH);
  });

  it('accepts a numeric string that slipped through untyped JSON', () => {
    expect(formatNumber(asNumber('56.3'), 'en')).toBe('56.3');
    expect(formatNumber(asNumber('not a number'), 'en')).toBe(DASH);
    expect(formatNumber(asNumber(''), 'en')).toBe(DASH);
  });

  it('falls back to the bare number rather than throwing on a malformed locale tag', () => {
    expect(formatNumber(56.3, 'not a locale!!')).toBe('56.3');
  });
});

describe('formatDate', () => {
  it('formats a valid ISO timestamp in the requested locale', () => {
    const day = String(new Date(ISO).getDate());
    const english = formatDate(ISO, 'en');

    expect(english).toContain('2026');
    expect(english).toContain(day);

    // Dutch orders the parts differently, which is the whole point of going through Intl.
    expect(formatDate(ISO, 'nl')).toContain('2026');
    expect(formatDate(ISO, 'nl')).not.toBe(english);
  });

  it('returns an identical string for repeated calls with the same input', () => {
    expect(formatDate(ISO, 'en')).toBe(formatDate(ISO, 'en'));
  });

  it('returns the placeholder for absent, blank or unparseable input', () => {
    expect(formatDate(null, 'en')).toBe(DASH);
    expect(formatDate(undefined, 'en')).toBe(DASH);
    expect(formatDate('', 'en')).toBe(DASH);
    expect(formatDate('   ', 'en')).toBe(DASH);
    expect(formatDate('not-a-date', 'en')).toBe(DASH);
    expect(formatDate('2026-13-45', 'en')).toBe(DASH);
  });

  it('falls back to the ISO calendar date rather than throwing on a malformed locale tag', () => {
    expect(formatDate(ISO, 'not a locale!!')).toBe('2026-01-15');
  });
});

describe('formatRelativeDate', () => {
  const now = new Date('2026-01-15T12:00:00.000Z');

  it('describes a recent timestamp relative to the reference time, in the locale', () => {
    expect(formatRelativeDate('2026-01-15T11:55:00.000Z', 'en', now)).toBe('5 minutes ago');
    expect(formatRelativeDate('2026-01-15T11:55:00.000Z', 'nl', now)).toBe('5 minuten geleden');
    expect(formatRelativeDate('2026-01-14T12:00:00.000Z', 'en', now)).toBe('yesterday');
    expect(formatRelativeDate('2026-01-15T12:00:00.000Z', 'en', now)).toBe('now');
  });

  it('switches to an absolute date once the gap exceeds a month', () => {
    const long = '2025-11-20T12:00:00.000Z';

    expect(formatRelativeDate(long, 'en', now)).toBe(formatDate(long, 'en'));
  });

  it('uses the current clock when no reference time is supplied', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'));

    expect(formatRelativeDate('2026-02-26T12:00:00.000Z', 'en')).toBe('3 days ago');
  });

  it('returns the placeholder for absent or unparseable input', () => {
    expect(formatRelativeDate(null, 'en', now)).toBe(DASH);
    expect(formatRelativeDate('not-a-date', 'en', now)).toBe(DASH);
  });
});

describe('titleCase', () => {
  it('returns an empty string for an empty, blank or missing tag', () => {
    expect(titleCase('')).toBe('');
    expect(titleCase('   ')).toBe('');
    expect(titleCase(null)).toBe('');
    expect(titleCase(undefined)).toBe('');
  });

  it('leaves an already-capitalised tag untouched', () => {
    expect(titleCase('Organic')).toBe('Organic');
  });

  it('strips an untranslated language prefix and sentence-cases the slug', () => {
    expect(titleCase('en:breakfast-cereals')).toBe('Breakfast cereals');
    expect(titleCase('plant-based-foods')).toBe('Plant based foods');
    expect(titleCase('no_added_sugar')).toBe('No added sugar');
  });

  it('keeps inner capitalisation so acronyms and German nouns survive', () => {
    expect(titleCase('de:Vollmilchschokolade')).toBe('Vollmilchschokolade');
    expect(titleCase('no-added-BPA')).toBe('No added BPA');
  });

  it('sentence-cases rather than title-cases, so localized tags keep their own casing', () => {
    // Open Food Facts already returns localized tags cased the way their language wants.
    // English title case turned "Produits laitiers" into "Produits Laitiers".
    expect(titleCase('Produits laitiers')).toBe('Produits laitiers');
    expect(titleCase('fr:produits-laitiers')).toBe('Produits laitiers');
    expect(titleCase('Pflanzliche Lebensmittel und Getränke')).toBe(
      'Pflanzliche Lebensmittel und Getränke',
    );
  });

  it('collapses every separator run into a single space', () => {
    expect(titleCase('en:cereals__and---potatoes')).toBe('Cereals and potatoes');
  });
});
