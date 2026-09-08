import Stripe from 'stripe';
import { env, type Locale } from '../config/env';

// No pinned apiVersion: the SDK default matches the types shipped with it,
// and pinning an older version here would silently disagree with them.
export const stripe = new Stripe(env.STRIPE_SECRET_KEY);

/** Our four UI locales expressed as Stripe Checkout / Billing Portal locales. */
export const STRIPE_LOCALES: Record<Locale, Stripe.Checkout.SessionCreateParams.Locale> = {
  en: 'en',
  nl: 'nl',
  de: 'de',
  fr: 'fr',
};
