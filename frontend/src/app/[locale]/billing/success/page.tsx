'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { useAccount } from '@/components';
import { Badge, ButtonLink, Card, Container } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { confirmCheckout } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { SubscriptionStatusApi } from '@/lib/types';

type SubscriptionStatusKey =
  | 'statusActive'
  | 'statusCanceled'
  | 'statusIncomplete'
  | 'statusIncompleteExpired'
  | 'statusNone'
  | 'statusPastDue'
  | 'statusPaused'
  | 'statusTrialing'
  | 'statusUnpaid';

const STATUS_KEYS: Record<SubscriptionStatusApi, SubscriptionStatusKey> = {
  none: 'statusNone',
  incomplete: 'statusIncomplete',
  incomplete_expired: 'statusIncompleteExpired',
  trialing: 'statusTrialing',
  active: 'statusActive',
  past_due: 'statusPastDue',
  canceled: 'statusCanceled',
  unpaid: 'statusUnpaid',
  paused: 'statusPaused',
};

/** Stripe redirects here before its webhook has necessarily landed. */
const MAX_REFRESH_ATTEMPTS = 3;
const REFRESH_INTERVAL_MS = 2500;

/** Only same-site paths are followed, so a crafted `next` cannot redirect off-site. */
function safeNextPath(value: string | null): string | null {
  if (value === null || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

function BillingSuccessContent() {
  const t = useTranslations('subscription');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const nextPath = safeNextPath(searchParams.get('next'));
  const { account, loading, refresh } = useAccount();

  const active = account?.subscription.active ?? false;
  const status = account?.subscription.status ?? 'none';
  const periodEnd = account?.subscription.currentPeriodEnd ?? null;
  const cancelAtPeriodEnd = account?.subscription.cancelAtPeriodEnd ?? false;

  // Kept in refs so the polling effect below runs once and never re-subscribes
  // on a `refresh` identity change.
  const refreshRef = useRef(refresh);
  const activeRef = useRef(active);
  useEffect(() => {
    refreshRef.current = refresh;
    activeRef.current = active;
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const poll = async (): Promise<void> => {
      attempts += 1;
      await refreshRef.current();
      if (cancelled || activeRef.current || attempts >= MAX_REFRESH_ATTEMPTS) return;
      timer = setTimeout(() => {
        void poll();
      }, REFRESH_INTERVAL_MS);
    };

    const settle = async (): Promise<void> => {
      if (sessionId !== null) {
        try {
          // Reconciles straight from the session, so entitlement does not depend
          // on the webhook having been delivered.
          await confirmCheckout(sessionId);
        } catch {
          // Not fatal: the polling below still picks the webhook up if it lands.
        }
      }
      if (!cancelled) await poll();
    };

    void settle();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [sessionId]);

  // Checkout was started from a product page, so return the user to it once the
  // subscription is real rather than leaving them on a dead-end billing page.
  useEffect(() => {
    if (!active || nextPath === null) return;
    router.replace(nextPath);
  }, [active, nextPath, router]);

  return (
    <Container className="py-12">
      <Card className="mx-auto max-w-2xl">
        <span
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700 dark:bg-brand-800/30 dark:text-brand-200"
        >
          &#10003;
        </span>

        <h1 className="mt-4 text-2xl font-bold tracking-tight">{t('successTitle')}</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{t('successBody')}</p>

        <dl className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-black/5 pt-4 text-sm dark:border-white/10">
          <dt className="text-neutral-500 dark:text-neutral-400">{t('title')}</dt>
          <dd>
            <Badge tone={active ? 'success' : 'neutral'}>
              {loading && account === null ? tCommon('loading') : t(STATUS_KEYS[status])}
            </Badge>
          </dd>
          {periodEnd !== null ? (
            <dd className="w-full text-neutral-500 dark:text-neutral-400">
              {cancelAtPeriodEnd
                ? t('endsOn', { date: formatDate(periodEnd, locale) })
                : t('renewsOn', { date: formatDate(periodEnd, locale) })}
            </dd>
          ) : null}
        </dl>

        {!active ? (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
            {t('webhookHint')}
          </p>
        ) : null}

        <ButtonLink href={nextPath ?? '/'} className="mt-6">
          {t('continueToSearch')}
        </ButtonLink>
      </Card>
    </Container>
  );
}

/**
 * `useSearchParams` opts a component out of static prerendering, so the boundary
 * lets the shell render at build time and the session-dependent part hydrate on
 * the client instead of failing the build.
 */
export default function BillingSuccessPage() {
  return (
    <Suspense
      fallback={
        <Container className="py-12">
          <Card className="mx-auto max-w-2xl" />
        </Container>
      }
    >
      <BillingSuccessContent />
    </Suspense>
  );
}
