import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import en from '../../messages/en.json';
import de from '../../messages/de.json';
import fr from '../../messages/fr.json';
import nl from '../../messages/nl.json';

export type TestMessages = typeof en;

/** The real catalogues, so assertions are written against the copy that ships. */
export const messagesByLocale = { en, nl, de, fr } as const;

export type TestLocale = keyof typeof messagesByLocale;

interface RenderWithIntlOptions extends Omit<RenderOptions, 'wrapper'> {
  locale?: TestLocale;
  messages?: TestMessages;
}

/**
 * Renders inside `NextIntlClientProvider` with the real message files. Tests then
 * assert on the strings a user actually sees instead of on message keys, which also
 * makes a broken or renamed key fail the component test.
 */
export function renderWithIntl(ui: ReactElement, options: RenderWithIntlOptions = {}): RenderResult {
  const { locale = 'en', messages = messagesByLocale[locale], ...rest } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...rest });
}
