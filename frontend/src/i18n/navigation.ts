import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware replacements for `next/link` and the navigation hooks: they
 * keep the active locale prefix without every call site having to build it.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
