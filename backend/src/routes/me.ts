import { Router } from 'express';
import { getSubscriptionSummary } from '../services/subscriptionService';
import type { AccountResponse } from '../types/api';

export const meRouter: Router = Router();

meRouter.get('/', async (req, res) => {
  const user = req.user!;
  const subscription = await getSubscriptionSummary(user.id);

  // Entitlement is derived from the same read as the summary, so the two can
  // never contradict each other inside one response.
  const body: AccountResponse = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      preferredLocale: user.preferredLocale,
    },
    subscription,
    entitlements: { nutrition: subscription.active },
  };

  res.json(body);
});
