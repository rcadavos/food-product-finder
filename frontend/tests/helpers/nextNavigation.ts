import { vi } from 'vitest';

/**
 * Stand-in for `next/navigation`. Only the hooks this app actually uses are
 * implemented; anything else should fail loudly rather than return undefined.
 */

export const appRouterMock = {
  push: vi.fn<(href: string) => void>(),
  replace: vi.fn<(href: string) => void>(),
  prefetch: vi.fn<(href: string) => void>(),
  back: vi.fn<() => void>(),
  forward: vi.fn<() => void>(),
  refresh: vi.fn<() => void>(),
};

let pathname = '/en';
let searchParams = new URLSearchParams();
let params: Record<string, string> = { locale: 'en' };

export function setAppPathname(next: string): void {
  pathname = next;
}

export function setAppSearchParams(init: string | Record<string, string>): void {
  searchParams = new URLSearchParams(init);
}

export function setAppParams(next: Record<string, string>): void {
  params = next;
}

export function resetAppNavigation(): void {
  pathname = '/en';
  searchParams = new URLSearchParams();
  params = { locale: 'en' };
}

export function usePathname(): string {
  return pathname;
}

export function useSearchParams(): URLSearchParams {
  return searchParams;
}

export function useParams(): Record<string, string> {
  return params;
}

export function useRouter(): typeof appRouterMock {
  return appRouterMock;
}

/** Mirrors Next's control-flow throw so `notFound()` call sites stay observable. */
export function notFound(): never {
  throw new Error('NEXT_NOT_FOUND');
}

export function redirect(href: string): never {
  throw new Error(`NEXT_REDIRECT:${href}`);
}
