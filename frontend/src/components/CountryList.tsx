import { titleCase } from '@/lib/format';
import type { CountryTag } from '@/lib/types';
import { CountryFlag } from './CountryFlag';
import { Chip } from './ui';

interface CountryListProps {
  label: string;
  countries: CountryTag[];
  emptyText?: string;
}

/**
 * Like `TagList`, but each chip carries the country's flag. Kept separate because
 * countries are the only tag list that arrives with a stable identifier attached —
 * categories, labels and allergens are display strings and nothing more.
 */
export function CountryList({ label, countries, emptyText }: CountryListProps) {
  if (countries.length === 0 && emptyText === undefined) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </h3>
      {countries.length > 0 ? (
        <ul role="list" className="flex flex-wrap gap-2">
          {countries.map((country) => (
            <li key={`${country.code ?? '??'}-${country.name}`}>
              <Chip>
                <CountryFlag code={country.code} />
                {titleCase(country.name)}
              </Chip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{emptyText}</p>
      )}
    </section>
  );
}
