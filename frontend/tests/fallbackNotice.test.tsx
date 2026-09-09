import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FallbackNotice } from '@/components/FallbackNotice';
import type { Locale, TextSource } from '@/lib/types';
import de from '../messages/de.json';
import en from '../messages/en.json';
import fr from '../messages/fr.json';
import nl from '../messages/nl.json';
import { renderWithIntl } from './helpers/render';

/**
 * Substitutes the simple `{name}` arguments the two fallback messages use, so the
 * expected string is derived from the shipped catalogue instead of being retyped
 * here — a reworded notice then fails this test instead of passing it silently.
 */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? values[name] : match,
  );
}

/** Every source that means "this is not the language you asked for". */
const FALLBACK_SOURCES: readonly TextSource[] = ['default', 'english', 'other'];

describe('FallbackNotice', () => {
  it('renders nothing when the text is already in the requested language', () => {
    const { container } = renderWithIntl(<FallbackNotice source="requested" requestedLocale="en" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no text at all, because the field renders its own placeholder', () => {
    const { container } = renderWithIntl(<FallbackNotice source="missing" requestedLocale="en" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('names both languages when Open Food Facts fell back to English', () => {
    renderWithIntl(<FallbackNotice source="english" requestedLocale="nl" />, { locale: 'nl' });

    expect(
      screen.getByText(
        fill(nl.product.fallbackNotice, {
          requested: nl.languageIn.nl,
          shown: nl.languageIn.en,
        }),
      ),
    ).toBeInTheDocument();
  });

  it('writes the language names the way the sentence language writes them, not as autonyms', () => {
    const { container } = renderWithIntl(<FallbackNotice source="english" requestedLocale="fr" />, {
      locale: 'fr',
    });

    const text = container.textContent ?? '';
    expect(text).toBe(
      fill(fr.product.fallbackNotice, { requested: fr.languageIn.fr, shown: fr.languageIn.en }),
    );
    // The switcher's autonyms ("English", "Français") read as a foreign body inside French prose.
    expect(text).not.toContain(en.language.en);
    expect(text).not.toContain(fr.language.fr);
    expect(text).toContain(fr.languageIn.en);
  });

  it('says the language is unknown, not that the field is empty, for an unlabelled text', () => {
    for (const source of ['default', 'other'] as const) {
      const { container, unmount } = renderWithIntl(
        <FallbackNotice source={source} requestedLocale="en" />,
      );

      // The text itself is rendered right next to this notice, so claiming Open Food
      // Facts has no data for the field contradicts what the reader can see.
      expect(container.textContent).toBe(
        fill(en.product.fallbackUnknownLanguage, { requested: en.languageIn.en }),
      );
      expect(container.textContent).not.toContain(en.product.incompleteData);
      unmount();
    }
  });

  it('translates the unknown-language notice into the active locale', () => {
    renderWithIntl(<FallbackNotice source="other" requestedLocale="de" />, { locale: 'de' });

    expect(
      screen.getByText(fill(de.product.fallbackUnknownLanguage, { requested: de.languageIn.de })),
    ).toBeInTheDocument();
  });

  it('keeps its icon out of the accessibility tree so only the sentence is announced', () => {
    const { container } = renderWithIntl(<FallbackNotice source="english" requestedLocale="fr" />);

    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('produces a non-empty, placeholder-free sentence for every locale and fallback source', () => {
    const locales: readonly Locale[] = ['en', 'nl', 'de', 'fr'];

    for (const locale of locales) {
      for (const source of FALLBACK_SOURCES) {
        const { container, unmount } = renderWithIntl(
          <FallbackNotice source={source} requestedLocale={locale} />,
          { locale },
        );

        const text = container.textContent ?? '';
        expect(text.length).toBeGreaterThan(0);
        // An unsubstituted `{requested}` or a missing key would surface here.
        expect(text).not.toMatch(/[{}]/);
        unmount();
      }
    }
  });
});
