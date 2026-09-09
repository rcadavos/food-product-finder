import { useLocale, useTranslations } from 'next-intl';
import { defaultLocale, locales } from '@/i18n/routing';
import { formatNutrientValue } from '@/lib/format';
import type { NutrientKey, NutritionFacts } from '@/lib/types';
import { Card, cn } from './ui';

/** Rendered indented, the way a nutrition label writes "of which …". */
const SUB_NUTRIENTS: readonly NutrientKey[] = ['saturated-fat', 'sugars'];

export function NutritionTable({ nutrition }: { nutrition: NutritionFacts }) {
  const t = useTranslations('nutrition');
  const nutrient = useTranslations('nutrition.keys');
  const common = useTranslations('common');
  const activeLocale = useLocale();
  const locale = locales.find((candidate) => candidate === activeLocale) ?? defaultLocale;

  const showPerServing = nutrition.hasPerServing;

  return (
    <Card as="section" padding="none">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/5 px-5 py-4 dark:border-white/10">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{t('title')}</h2>
        {nutrition.servingSize ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {/* French puts a narrow no-break space before the colon, so the catalogue owns it. */}
            {common('labelledValue', { label: t('perServing'), value: nutrition.servingSize })}
          </p>
        ) : null}
      </div>

      {nutrition.isEmpty ? (
        <p className="px-5 py-6 text-sm text-neutral-500 dark:text-neutral-400">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr className="border-b border-black/5 dark:border-white/10">
                <th scope="col" className="px-5 py-2 text-left font-medium text-neutral-500 dark:text-neutral-400">
                  {t('nutrient')}
                </th>
                <th scope="col" className="px-5 py-2 text-right font-medium text-neutral-500 dark:text-neutral-400">
                  {t('per100g')}
                </th>
                {showPerServing ? (
                  <th scope="col" className="px-5 py-2 text-right font-medium text-neutral-500 dark:text-neutral-400">
                    {t('perServing')}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {nutrition.nutrients.map((entry) => (
                <tr
                  key={entry.key}
                  className="border-b border-black/5 last:border-0 even:bg-neutral-50/60 dark:border-white/10 dark:even:bg-neutral-800/40"
                >
                  <th
                    scope="row"
                    className={cn(
                      'py-2 pr-5 text-left font-medium text-neutral-800 dark:text-neutral-100',
                      SUB_NUTRIENTS.includes(entry.key) ? 'pl-9 font-normal' : 'pl-5',
                    )}
                  >
                    {nutrient(entry.key)}
                  </th>
                  <td className="px-5 py-2 text-right tabular-nums text-neutral-800 dark:text-neutral-100">
                    {formatNutrientValue(entry.per100g, entry.unit, locale)}
                  </td>
                  {showPerServing ? (
                    <td className="px-5 py-2 text-right tabular-nums text-neutral-800 dark:text-neutral-100">
                      {formatNutrientValue(entry.perServing, entry.unit, locale)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
