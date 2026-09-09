import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Run on everything except Next internals and files with an extension.
  // The doubled backslash matters: this is a normal string literal, so an escaped dot
  // written with one backslash collapses to a bare dot, which matches any character and
  // makes the negative lookahead reject every non-empty path.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
