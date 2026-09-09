import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { icuArguments, icuSignature } from './helpers/icu';

/**
 * The safety net for translation work: next-intl fails at *render* time when a key
 * is missing from a locale, which in practice means a page in Dutch or French
 * breaks long after the English one was reviewed. Comparing the four catalogues
 * structurally moves that failure into the test run.
 *
 * The files are read from disk rather than imported so the assertions cover exactly
 * what ships, including anything a bundler would quietly tolerate.
 */

const LOCALES = ['en', 'nl', 'de', 'fr'] as const;
type Locale = (typeof LOCALES)[number];

const REFERENCE: Locale = 'en';
const OTHER_LOCALES = LOCALES.filter((locale) => locale !== REFERENCE);

type MessageNode = string | { [key: string]: MessageNode };

function isMessageObject(value: unknown): value is { [key: string]: MessageNode } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadCatalogue(locale: Locale): MessageNode {
  // Resolved from the package root (Vitest's cwd) rather than `import.meta.url`,
  // which the CommonJS transform does not resolve reliably on Windows.
  const path = resolve(process.cwd(), 'messages', `${locale}.json`);
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isMessageObject(parsed)) throw new Error(`messages/${locale}.json is not an object`);
  return parsed;
}

/** Flattens to `namespace.key` → value; only leaves (strings) end up in the map. */
function flatten(node: MessageNode, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>();

  if (typeof node === 'string') {
    flat.set(prefix, node);
    return flat;
  }

  for (const [key, child] of Object.entries(node)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof child === 'string') {
      flat.set(path, child);
    } else if (isMessageObject(child)) {
      for (const [nestedPath, value] of flatten(child, path)) flat.set(nestedPath, value);
    } else {
      throw new Error(`Unsupported message value at ${path}`);
    }
  }

  return flat;
}

const catalogues = new Map<Locale, Map<string, string>>(
  LOCALES.map((locale) => [locale, flatten(loadCatalogue(locale))]),
);

function messagesFor(locale: Locale): Map<string, string> {
  const catalogue = catalogues.get(locale);
  if (!catalogue) throw new Error(`No catalogue loaded for ${locale}`);
  return catalogue;
}

const reference = messagesFor(REFERENCE);
const referenceKeys = [...reference.keys()].sort();

describe('message catalogues', () => {
  it('loads a non-trivial English catalogue to compare against', () => {
    expect(referenceKeys.length).toBeGreaterThan(50);
    expect(referenceKeys).toContain('nutrition.keys.energy-kcal');
    expect(referenceKeys).toContain('search.resultsFor');
  });

  it.each(OTHER_LOCALES)('%s.json has exactly the keys en.json has', (locale) => {
    const keys = new Set(messagesFor(locale).keys());

    const missing = referenceKeys.filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !reference.has(key)).sort();

    expect(
      { missing, extra },
      `messages/${locale}.json key set differs from messages/en.json`,
    ).toEqual({ missing: [], extra: [] });
  });

  it.each(LOCALES)('%s.json has no empty values', (locale) => {
    const empty = [...messagesFor(locale)]
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);

    expect(empty, `messages/${locale}.json has blank translations`).toEqual([]);
  });

  it.each(LOCALES)('%s.json contains only valid ICU syntax', (locale) => {
    const broken = [...messagesFor(locale)]
      .filter(([, value]) => {
        try {
          icuSignature(value);
          return false;
        } catch {
          return true;
        }
      })
      .map(([key, value]) => `${key}: ${value}`);

    expect(broken, `messages/${locale}.json has unparseable ICU messages`).toEqual([]);
  });

  it.each(OTHER_LOCALES)('%s.json uses the same ICU placeholders as en.json', (locale) => {
    const translations = messagesFor(locale);

    const mismatches = referenceKeys
      .filter((key) => translations.has(key))
      .map((key) => {
        const expected = icuArguments(reference.get(key) ?? '');
        const actual = icuArguments(translations.get(key) ?? '');
        return { key, expected, actual };
      })
      .filter(({ expected, actual }) => expected.join('|') !== actual.join('|'));

    expect(
      mismatches,
      `messages/${locale}.json placeholders drifted from messages/en.json`,
    ).toEqual([]);
  });

  it.each(OTHER_LOCALES)('%s.json keeps the ICU argument types of en.json', (locale) => {
    const translations = messagesFor(locale);

    // Plural/select categories legitimately differ per language, but an argument
    // that is a plural in English must stay a plural, or `#` renders as literal text.
    const mismatches = referenceKeys
      .filter((key) => translations.has(key))
      .map((key) => ({
        key,
        expected: icuSignature(reference.get(key) ?? ''),
        actual: icuSignature(translations.get(key) ?? ''),
      }))
      .filter(({ expected, actual }) => JSON.stringify(expected) !== JSON.stringify(actual));

    expect(mismatches, `messages/${locale}.json changed an ICU argument type`).toEqual([]);
  });

  it.each(OTHER_LOCALES)('%s.json is actually translated, not copied from en.json', (locale) => {
    const translations = messagesFor(locale);

    // Proper nouns and locale-endonym keys are identical by design.
    const allowedIdentical = new Set([
      'app.title',
      'language.en',
      'language.nl',
      'language.de',
      'language.fr',
      'product.nutriscore',
      'product.nutriscoreValue',
      'product.ecoscore',
    ]);

    const identical = referenceKeys.filter(
      (key) => !allowedIdentical.has(key) && translations.get(key) === reference.get(key),
    );

    // A handful of coincidences are normal ("Fat" is "Fat" nowhere, but "Menu" often is);
    // a catalogue that was never translated shows up as dozens of them.
    expect(
      identical.length,
      `messages/${locale}.json repeats English for: ${identical.join(', ')}`,
    ).toBeLessThan(10);
  });
});
