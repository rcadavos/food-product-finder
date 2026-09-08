'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { defaultLocale, locales } from '@/i18n/routing';
import { formatDate } from '@/lib/format';
import type { SubscriptionStatusApi } from '@/lib/types';
import { useAccount } from './AccountProvider';
import { ManageButton } from './ManageButton';
import { SubscribeButton } from './SubscribeButton';
import { Badge, Skeleton, VisuallyHidden, cn, type BadgeTone } from './ui';

const STATUS_KEYS = {
  none: 'statusNone',
  incomplete: 'statusIncomplete',
  incomplete_expired: 'statusIncompleteExpired',
  trialing: 'statusTrialing',
  active: 'statusActive',
  past_due: 'statusPastDue',
  canceled: 'statusCanceled',
  unpaid: 'statusUnpaid',
  paused: 'statusPaused',
} as const satisfies Record<SubscriptionStatusApi, string>;

/** Statuses the user can fix by paying; they get the amber pill. */
const NEEDS_ATTENTION: readonly SubscriptionStatusApi[] = ['past_due', 'incomplete'];

/** "Demo User" -> "DU". Falls back to the email so the avatar is never blank. */
function initialsOf(name: string | null, email: string): string {
  const source = name?.trim() ? name.trim() : email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part.charAt(0));
  return letters.join('').toUpperCase() || '?';
}

export function ProfileMenu() {
  const t = useTranslations('subscription');
  const account_ = useTranslations('account');
  const common = useTranslations('common');
  const activeLocale = useLocale();
  const locale = locales.find((candidate) => candidate === activeLocale) ?? defaultLocale;
  const { account, loading } = useAccount();

  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // A menu that only closed on its own trigger would strand the panel open on
  // any outside click, so both dismissal routes are handled at the document.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
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

  if (account === null) {
    // While the first /me request is in flight the trigger is a placeholder; if it
    // failed outright we stay silent rather than guess at an account state.
    return loading ? (
      <div className="flex items-center gap-2">
        <Skeleton className="size-9 rounded-full" />
        <VisuallyHidden>{common('loading')}</VisuallyHidden>
      </div>
    ) : null;
  }

  const { user, subscription } = account;
  const displayName = user.name?.trim() ? user.name : account_('demoUser');
  const statusLabel = t(STATUS_KEYS[subscription.status]);
  const tone: BadgeTone = subscription.active
    ? 'success'
    : NEEDS_ATTENTION.includes(subscription.status)
      ? 'warning'
      : 'neutral';

  const periodLabel = subscription.currentPeriodEnd
    ? t(subscription.cancelAtPeriodEnd ? 'endsOn' : 'renewsOn', {
        date: formatDate(subscription.currentPeriodEnd, locale),
      })
    : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={cn(
          'flex items-center gap-2 rounded-full border border-neutral-200 py-1 pl-1 pr-2 transition sm:pr-3',
          'hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          'dark:border-neutral-700 dark:hover:bg-neutral-800',
          open && 'bg-neutral-50 dark:bg-neutral-800',
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white sm:size-9"
        >
          {initialsOf(user.name, user.email)}
        </span>
        <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
          <span className="max-w-36 truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
            {displayName}
          </span>
          {/*
            aria-hidden because the accessibility tree gets the full label/value
            pair below; leaving both would say the status twice.
          */}
          <span
            aria-hidden="true"
            className={cn(
              'max-w-36 truncate text-xs',
              tone === 'success'
                ? 'text-brand-700 dark:text-brand-300'
                : tone === 'warning'
                  ? 'text-accent-600 dark:text-accent-500'
                  : 'text-neutral-500 dark:text-neutral-400',
            )}
          >
            {statusLabel}
          </span>
        </span>
        {/*
          Below `sm` the stacked text is display:none, so the dot carries the same
          meaning in the space available. Colour is never the only signal: the
          wording stays in the accessibility tree either way.
        */}
        <span
          aria-hidden="true"
          className={cn(
            'size-2 rounded-full sm:hidden',
            tone === 'success' ? 'bg-brand-500' : tone === 'warning' ? 'bg-accent-500' : 'bg-neutral-400',
          )}
        />
        <VisuallyHidden>
          {account_('menu')}
          {' — '}
          {common('labelledValue', { label: t('title'), value: statusLabel })}
        </VisuallyHidden>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={account_('menu')}
          className="absolute right-0 z-50 mt-2 w-72 rounded-[var(--radius-card)] border border-black/5 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-neutral-900"
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white"
            >
              {initialsOf(user.name, user.email)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{displayName}</p>
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{user.email}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3 dark:border-white/10">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('title')}</span>
            <Badge tone={tone}>
              <VisuallyHidden>{common('labelledValue', { label: t('title'), value: statusLabel })}</VisuallyHidden>
              <span aria-hidden="true">{statusLabel}</span>
            </Badge>
          </div>

          {periodLabel === null ? null : (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{periodLabel}</p>
          )}

          <div role="none" className="mt-3">
            {subscription.active ? (
              <ManageButton variant="primary" className="[&_button]:w-full" />
            ) : (
              <>
                <SubscribeButton variant="primary" className="[&_button]:w-full" />
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{t('priceNote')}</p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
