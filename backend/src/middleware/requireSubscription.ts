import type { RequestHandler } from 'express';
import { subscriptionRequired } from '../lib/httpError';

/** Server-side gate for paid data; the payload itself is withheld as well. */
export const requireSubscription: RequestHandler = (req, _res, next) => {
  if (req.entitlements?.nutrition === true) {
    next();
    return;
  }
  next(subscriptionRequired('An active subscription is required to read nutritional values.'));
};
