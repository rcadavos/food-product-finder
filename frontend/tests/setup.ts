import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';
import { resetNavigation } from './helpers/navigation';
import { resetAppNavigation } from './helpers/nextNavigation';

/**
 * Both navigation modules are mocked for every test file. `@/i18n/navigation` is
 * built by next-intl's `createNavigation()` and `next/navigation` reads the App
 * Router context; neither exists outside a running Next.js server, and both are
 * boundaries we want to assert against rather than exercise.
 *
 * A test file that needs different behaviour overrides these by declaring its own
 * `vi.mock()` for the same specifier — the file-local factory wins — or, more
 * usually, by driving the exported `setPathname` / `routerMock` handles.
 */
vi.mock('@/i18n/navigation', () => import('./helpers/navigation'));
vi.mock('next/navigation', () => import('./helpers/nextNavigation'));

/**
 * Nothing in the suite may touch the network. Component tests mock `@/lib/api`;
 * `api.test.ts` stubs `fetch` itself. Anything else reaching this default is a bug
 * in the test, so it fails with a message that says so.
 */
const unexpectedFetch = (input: unknown): Promise<never> =>
  Promise.reject(
    new Error(
      `Unexpected network call to ${String(input)}. Mock '@/lib/api' or stub fetch in the test.`,
    ),
  );

beforeEach(() => {
  resetNavigation();
  resetAppNavigation();
  vi.stubGlobal('fetch', vi.fn(unexpectedFetch));
});
