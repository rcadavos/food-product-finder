import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BrandMark } from './BrandMark';
import { Container } from './ui';

const LINK_CLASS =
  'rounded font-medium text-brand-700 underline decoration-brand-300 underline-offset-4 transition hover:text-brand-800 hover:decoration-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:text-brand-300 dark:decoration-brand-700 dark:hover:text-brand-200';

export function SiteFooter() {
  const t = useTranslations('common');
  const app = useTranslations('app');

  return (
    <footer className="mt-20 border-t border-black/5 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-neutral-950/70">
      <Container className="py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <span
                aria-hidden="true"
                className="grid size-7 place-items-center rounded-lg bg-brand-600 text-white"
              >
                <BrandMark className="size-4" />
              </span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {app('title')}
              </span>
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              {app('description')}
            </p>
          </div>

          <div className="text-xs text-neutral-500 sm:text-right dark:text-neutral-400">
            <p>
              {t('poweredBy')}{' '}
              <a
                href="https://world.openfoodfacts.org"
                target="_blank"
                rel="noreferrer noopener"
                className={LINK_CLASS}
              >
                openfoodfacts.org
              </a>
            </p>
            {/* ODbL requires the source and licence to be named wherever the data is shown. */}
            <p className="mt-2 max-w-xs leading-relaxed sm:ml-auto">{t('dataLicence')}</p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
