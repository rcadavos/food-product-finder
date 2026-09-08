import { useTranslations } from 'next-intl';
import type { Locale, TextSource } from '@/lib/types';

interface FallbackNoticeProps {
  source: TextSource;
  requestedLocale: Locale;
}

/**
 * Tells the reader when a text is not in the language they asked for. Language names come
 * from `languageIn` rather than the switcher's autonyms, because a name spliced into prose
 * has to be written the way the surrounding sentence's language writes it.
 */
export function FallbackNotice({ source, requestedLocale }: FallbackNoticeProps) {
  const t = useTranslations('product');
  const languageIn = useTranslations('languageIn');

  if (source === 'requested' || source === 'missing') return null;

  // 'default' and 'other' mean Open Food Facts did not say which language the text is in.
  // The text itself is right there, so the notice names the gap, not a missing field.
  const message =
    source === 'english'
      ? t('fallbackNotice', { requested: languageIn(requestedLocale), shown: languageIn('en') })
      : t('fallbackUnknownLanguage', { requested: languageIn(requestedLocale) });

  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
      <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-current">
        <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3a1.15 1.15 0 1 1 0 2.3A1.15 1.15 0 0 1 10 5Zm1.1 9.9H8.9a.75.75 0 0 1 0-1.5h.35v-2.6H9a.75.75 0 0 1 0-1.5h1a.75.75 0 0 1 .75.75v3.35h.35a.75.75 0 0 1 0 1.5Z" />
      </svg>
      <span>{message}</span>
    </p>
  );
}
