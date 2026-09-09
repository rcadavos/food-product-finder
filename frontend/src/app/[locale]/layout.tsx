import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components';
import { AccountProvider } from '@/components/AccountProvider';
import { routing } from '@/i18n/routing';
import '@/app/globals.css';

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Omit<LocaleLayoutProps, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: 'app' });
  const title = t('title');

  return {
    // Pages that set their own title (product detail) get the app name appended for free.
    title: { default: title, template: `%s · ${title}` },
    description: t('description'),
    applicationName: title,
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Opts this subtree out of dynamic rendering: without it, reading the locale from the
  // request would force every page under /[locale] to render per request.
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-brand-50/40 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <NextIntlClientProvider>
          <AccountProvider>
            <div className="flex min-h-dvh flex-col">
              <SiteHeader />
              {/* tabIndex lets the header's skip link move focus here. */}
              <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
                {children}
              </main>
              <SiteFooter />
            </div>
          </AccountProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
