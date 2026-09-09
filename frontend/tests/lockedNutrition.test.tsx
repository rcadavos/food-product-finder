import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LockedNutrition } from '@/components/LockedNutrition';
import en from '../messages/en.json';
import nl from '../messages/nl.json';
import { nutritionFacts } from './helpers/fixtures';
import { renderWithIntl } from './helpers/render';

/**
 * The panel embeds `SubscribeButton`, which talks to the API when pressed. These tests
 * only look at what is rendered, so the client is replaced wholesale to guarantee the
 * component cannot reach the network even if the CTA were activated.
 */
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  createCheckoutSession: vi.fn(),
}));

describe('LockedNutrition', () => {
  it('explains why the values are hidden and how to unlock them', () => {
    renderWithIntl(<LockedNutrition />);

    expect(screen.getByRole('heading', { name: en.nutrition.lockedTitle })).toBeInTheDocument();
    expect(screen.getByText(en.nutrition.lockedBody)).toBeInTheDocument();
    expect(screen.getByText(en.subscription.priceNote)).toBeInTheDocument();
  });

  it('offers the unlock call to action as a real button with an accessible name', () => {
    renderWithIntl(<LockedNutrition />);

    const cta = screen.getByRole('button', { name: en.nutrition.lockedCta });
    expect(cta.tagName).toBe('BUTTON');
    expect(cta).toHaveAttribute('type', 'button');
    expect(cta).toBeEnabled();
  });

  it('names what unlocking gives you rather than reusing the generic subscribe wording', () => {
    renderWithIntl(<LockedNutrition />);

    // "Subscribe" said nothing about what was behind the paywall.
    expect(screen.queryByRole('button', { name: en.subscription.subscribe })).toBeNull();
    expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument();
  });

  it('shows no number anywhere, so the preview cannot be read as withheld data', () => {
    const { container } = renderWithIntl(<LockedNutrition />);

    // The server withholds the figures entirely; a paywall that leaked "539 kcal"
    // through a decorative preview would defeat the gate.
    expect(container.textContent ?? '').toMatch(/^[^0-9]*$/);

    for (const nutrient of nutritionFacts().nutrients) {
      if (nutrient.per100g === null) continue;
      expect(container.textContent ?? '').not.toContain(String(nutrient.per100g));
    }
  });

  it('marks the blurred preview rows as decorative and fills them with dashes', () => {
    const { container } = renderWithIntl(<LockedNutrition />);

    const preview = container.querySelector('[aria-hidden="true"]');
    expect(preview).not.toBeNull();
    expect(preview?.textContent).toContain('—');

    // Decorative rows must not reach the accessibility tree as real nutrient labels.
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryAllByRole('rowheader')).toHaveLength(0);
  });

  it('uses the active locale for the locked copy', () => {
    renderWithIntl(<LockedNutrition />, { locale: 'nl' });

    expect(screen.getByRole('heading', { name: nl.nutrition.lockedTitle })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: nl.nutrition.lockedCta })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: nl.subscription.subscribe })).toBeNull();
  });
});
