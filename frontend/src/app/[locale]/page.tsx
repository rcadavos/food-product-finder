import { useTranslations } from 'next-intl';

export default function Home() {
  const t = useTranslations('app');
  return <main className="p-8 text-2xl font-bold">{t('title')}</main>;
}
