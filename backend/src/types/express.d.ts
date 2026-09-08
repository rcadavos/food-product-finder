/**
 * `express-serve-static-core`'s `Request` extends the global `Express.Request`,
 * so augmenting that interface is what adds these properties to every handler.
 */
declare global {
  namespace Express {
    interface Request {
      /** Attached by the `demoUser` middleware; present on every `/api` route except `/api/health`. */
      user?: { id: string; email: string; name: string | null; preferredLocale: string };
      /** Access rights derived from the user's local subscription projection. */
      entitlements?: { nutrition: boolean };
    }
  }
}

export {};
