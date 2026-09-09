'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BrandMark } from './BrandMark';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ProfileMenu } from './ProfileMenu';
import { Container } from './ui';

export function SiteHeader() {
  const app = useTranslations('app');
  const nav = useTranslations('nav');

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-neutral-950/90">
      {/* First focusable element on every page; the locale layout marks the target. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {nav('skipToContent')}
      </a>

      <Container className="flex items-center justify-between gap-3 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
            <BrandMark />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{app('title')}</span>
            <span className="hidden text-xs text-neutral-500 sm:inline dark:text-neutral-400">{nav('home')}</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <ProfileMenu />
        </div>
      </Container>
    </header>
  );
}
