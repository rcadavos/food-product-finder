import { vi } from 'vitest';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

/**
 * Stand-in for `@/i18n/navigation`. The real module is produced by
 * `createNavigation(routing)`, which reaches into next-intl's request/route
 * configuration and expects a Next.js router to be mounted — neither exists in
 * jsdom. Tests assert on the *arguments* the components pass to navigation, so
 * a recording double is both sufficient and more precise than the real thing.
 *
 * The mocked `Link` deliberately does not add the locale prefix: assertions read
 * the href the component asked for, not the one the router would rewrite it to.
 */

export const routerMock = {
  push: vi.fn<(href: string, options?: { locale?: string }) => void>(),
  replace: vi.fn<(href: string, options?: { locale?: string }) => void>(),
  prefetch: vi.fn<(href: string, options?: { locale?: string }) => void>(),
  back: vi.fn<() => void>(),
  forward: vi.fn<() => void>(),
  refresh: vi.fn<() => void>(),
};

let currentPathname = '/';

/** Sets what `usePathname()` returns — locale-stripped, the way next-intl reports it. */
export function setPathname(pathname: string): void {
  currentPathname = pathname;
}

export function resetNavigation(): void {
  currentPathname = '/';
}

export function usePathname(): string {
  return currentPathname;
}

export function useRouter(): typeof routerMock {
  return routerMock;
}

export function getPathname({ href, locale }: { href: string; locale: string }): string {
  return `/${locale}${href === '/' ? '' : href}`;
}

export function redirect({ href }: { href: string; locale?: string }): never {
  throw new Error(`redirect(${href})`);
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname: string };
  children?: ReactNode;
};

export function Link({ href, children, ...rest }: LinkProps) {
  return (
    <a href={typeof href === 'string' ? href : href.pathname} {...rest}>
      {children}
    </a>
  );
}
