import { defineRouting } from 'next-intl/routing';

/** The four locales the assignment asks for. `en` doubles as the fallback. */
export const locales = ['en', 'nl', 'de', 'fr'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

/** Cookie the manual language selector writes so the choice survives a reload. */
export const LOCALE_COOKIE = 'FPF_LOCALE';

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Every URL carries its locale (/en/..., /nl/...), which keeps pages
  // shareable and lets the server render the right language without guessing.
  localePrefix: 'always',
  localeCookie: {
    name: LOCALE_COOKIE,
    maxAge: 60 * 60 * 24 * 365,
  },
});
