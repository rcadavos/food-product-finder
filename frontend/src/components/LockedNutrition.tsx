import { useTranslations } from 'next-intl';
import type { NutrientKey } from '@/lib/types';
import { SubscribeButton } from './SubscribeButton';
import { Card } from './ui';

/** Real nutrient names but no values: the preview must never suggest a number we withheld. */
const PREVIEW_KEYS: readonly NutrientKey[] = ['energy-kcal', 'fat', 'sugars', 'proteins', 'salt'];

export function LockedNutrition() {
  const t = useTranslations('nutrition');
  const nutrient = useTranslations('nutrition.keys');
  const subscription = useTranslations('subscription');

  return (
    <Card as="section" padding="none" className="grid overflow-hidden">
      <div aria-hidden="true" className="col-start-1 row-start-1 select-none px-5 py-6 opacity-40 blur-[2px]">
        {PREVIEW_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center justify-between border-b border-black/5 py-2 text-sm last:border-0 dark:border-white/10"
          >
            <span className="text-neutral-700 dark:text-neutral-200">{nutrient(key)}</span>
            <span className="text-neutral-500 dark:text-neutral-400">&mdash;</span>
          </div>
        ))}
      </div>

      <div className="col-start-1 row-start-1 grid place-items-center bg-white/85 px-6 py-8 text-center backdrop-blur-[1px] dark:bg-neutral-900/85">
        <div className="max-w-sm">
          <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-100">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
              <path d="M12 2a5 5 0 0 0-5 5v2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm0 2a3 3 0 0 1 3 3v2H9V7a3 3 0 0 1 3-3Zm0 9a2 2 0 0 1 1 3.73V18a1 1 0 0 1-2 0v-1.27A2 2 0 0 1 12 13Z" />
            </svg>
          </span>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{t('lockedTitle')}</h2>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{t('lockedBody')}</p>
          {/* The paywall names what unlocking gives you; "Subscribe" alone said nothing. */}
          <SubscribeButton variant="primary" label={t('lockedCta')} className="mt-4" />
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">{subscription('priceNote')}</p>
        </div>
      </div>
    </Card>
  );
}
