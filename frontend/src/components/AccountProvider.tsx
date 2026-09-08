'use client';

import { useTranslations } from 'next-intl';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiClientError, getAccount } from '@/lib/api';
import type { AccountResponse } from '@/lib/types';

export interface AccountContextValue {
  account: AccountResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

type ErrorKey = 'network' | 'generic';

/**
 * Holds the demo user's account and entitlement state for the whole client tree,
 * so the header badge and the billing pages never disagree about the subscription.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('errors');
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  // Keeps a slow first request from overwriting the answer of a later refresh().
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = (requestId.current += 1);
    setLoading(true);
    try {
      const next = await getAccount();
      if (id !== requestId.current) return;
      setAccount(next);
      setErrorKey(null);
    } catch (error) {
      if (id !== requestId.current) return;
      setAccount(null);
      setErrorKey(error instanceof ApiClientError && error.code === 'NETWORK_ERROR' ? 'network' : 'generic');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AccountContextValue>(
    () => ({ account, loading, error: errorKey === null ? null : t(errorKey), refresh }),
    [account, loading, errorKey, refresh, t],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (value === null) {
    throw new Error('useAccount() was called outside of <AccountProvider>. Wrap the tree in AccountProvider first.');
  }
  return value;
}
