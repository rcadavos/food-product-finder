'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { defaultLocale, locales, type Locale } from '@/i18n/routing';
import { VisuallyHidden, cn } from './ui';

const FLAG_CLASS = 'h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-black/10 dark:ring-white/20';

/**
 * Inline SVG rather than the regional-indicator emoji: Windows renders those as
 * bare letter pairs ("GB", "NL"), so an emoji flag would read as stray text on a
 * large share of visitors' machines.
 */
function LocaleFlag({ locale }: { locale: Locale }) {
  switch (locale) {
    case 'nl':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 16" className={FLAG_CLASS}>
          <rect width="24" height="16" fill="#fff" />
          <rect width="24" height="5.33" fill="#ae1c28" />
          <rect y="10.67" width="24" height="5.33" fill="#21468b" />
        </svg>
      );
    case 'de':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 16" className={FLAG_CLASS}>
          <rect width="24" height="16" fill="#d00" />
          <rect width="24" height="5.33" fill="#000" />
          <rect y="10.67" width="24" height="5.33" fill="#ffce00" />
        </svg>
      );
    case 'fr':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 16" className={FLAG_CLASS}>
          <rect width="24" height="16" fill="#fff" />
          <rect width="8" height="16" fill="#002395" />
          <rect x="16" width="8" height="16" fill="#ed2939" />
        </svg>
      );
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 24 16" className={FLAG_CLASS}>
          <rect width="24" height="16" fill="#012169" />
          <path d="M0 0 24 16M24 0 0 16" stroke="#fff" strokeWidth="3.2" />
          <path d="M0 0 24 16M24 0 0 16" stroke="#c8102e" strokeWidth="1.8" />
          <path d="M12 0V16M0 8H24" stroke="#fff" strokeWidth="5.4" />
          <path d="M12 0V16M0 8H24" stroke="#c8102e" strokeWidth="3.2" />
        </svg>
      );
  }
}

/**
 * A custom menu rather than a native `<select>`.
 *
 * The browser draws a native popup itself: it cannot be offset from the trigger,
 * rounded, padded or themed, and in Chromium it inherits the control's own opacity
 * and colours. Owning the panel is the only way to style it, so the ARIA a native
 * select would have given for free is implemented here instead — `menuitemradio`
 * for the checked state, roving focus for the arrow keys, Escape to dismiss, and
 * focus handed back to the trigger on close.
 */
export function LanguageSwitcher() {
  const t = useTranslations('language');
  const common = useTranslations('common');
  const activeLocale = useLocale();
  const locale = locales.find((candidate) => candidate === activeLocale) ?? defaultLocale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
      // Tabbing away is a dismissal too, otherwise the panel is left orphaned.
      if (event.key === 'Tab') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  // Opening lands the caret on the current language, so arrow keys start from
  // where the user already is rather than from the top of the list.
  useEffect(() => {
    if (!open) return;
    const index = locales.indexOf(locale);
    itemRefs.current[index === -1 ? 0 : index]?.focus();
  }, [open, locale]);

  function selectLocale(next: Locale) {
    setOpen(false);
    triggerRef.current?.focus();
    if (next === locale) return;

    // The query string is read from the URL here rather than through useSearchParams()
    // so this header does not force every page behind a Suspense boundary.
    const search = typeof window === 'undefined' ? '' : window.location.search;
    startTransition(() => {
      router.replace(`${pathname}${search}`, { locale: next });
    });
  }

  function moveFocus(from: number, delta: number) {
    const next = (from + delta + locales.length) % locales.length;
    itemRefs.current[next]?.focus();
  }

  function onItemKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(index, 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(index, -1);
        break;
      case 'Home':
        event.preventDefault();
        itemRefs.current[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        itemRefs.current[locales.length - 1]?.focus();
        break;
      default:
        break;
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white py-1.5 pl-2 pr-2 transition',
          'hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          'disabled:cursor-not-allowed disabled:opacity-60',
          'dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800',
          open && 'bg-neutral-50 dark:bg-neutral-800',
        )}
      >
        <LocaleFlag locale={locale} />
        <span
          aria-hidden="true"
          className="text-xs font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-200"
        >
          {locale}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={cn(
            'size-3 fill-neutral-500 transition-transform duration-200 dark:fill-neutral-400',
            open && 'rotate-180',
            'motion-reduce:transition-none',
          )}
        >
          <path d="M10 13.5 4.5 7h11L10 13.5Z" />
        </svg>
        {/* The visible code is decorative; the full pair is what gets announced. */}
        <VisuallyHidden>
          {common('labelledValue', { label: t('label'), value: t(locale) })}
        </VisuallyHidden>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t('label')}
          className={cn(
            // w-max sizes the panel to its widest option instead of a guessed fixed width.
            'absolute right-0 z-50 mt-2 w-max min-w-full origin-top-right rounded-xl border border-black/5 bg-white p-1.5 shadow-lift',
            'dark:border-white/10 dark:bg-neutral-900',
          )}
        >
          {locales.map((code, index) => {
            const checked = code === locale;
            return (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                onClick={() => {
                  selectLocale(code);
                }}
                onKeyDown={(event) => {
                  onItemKeyDown(event, index);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition',
                  'hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
                  'dark:hover:bg-neutral-800 dark:focus-visible:bg-neutral-800',
                  checked
                    ? 'font-semibold text-brand-800 dark:text-brand-200'
                    : 'text-neutral-700 dark:text-neutral-200',
                )}
              >
                <LocaleFlag locale={code} />
                <span className="flex-1 text-left">{t(code)}</span>
                {checked ? (
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 fill-brand-600 dark:fill-brand-400">
                    <path d="M8.2 14.3 4 10.1l1.4-1.4 2.8 2.8 6.4-6.4L16 6.5l-7.8 7.8Z" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
