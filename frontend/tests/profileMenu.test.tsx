import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProvider } from '@/components/AccountProvider';
import { ProfileMenu } from '@/components/ProfileMenu';
import { createCheckoutSession, getAccount } from '@/lib/api';
import type { AccountResponse, SubscriptionStatusApi } from '@/lib/types';
import en from '../messages/en.json';
import { renderWithIntl } from './helpers/render';

/** The menu is driven entirely by `/api/me`, so the API client is the seam. */
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getAccount: vi.fn(),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
}));

function account(
  status: SubscriptionStatusApi = 'none',
  overrides: Partial<AccountResponse['subscription']> = {},
): AccountResponse {
  const active = status === 'active' || status === 'trialing';
  return {
    user: { id: 'usr_1', email: 'demo@foodproductfinder.test', name: 'Demo User', preferredLocale: 'en' },
    subscription: {
      status,
      active,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      ...overrides,
    },
    entitlements: { nutrition: active },
  };
}

async function renderMenu(response: AccountResponse) {
  vi.mocked(getAccount).mockResolvedValue(response);
  renderWithIntl(
    <AccountProvider>
      <ProfileMenu />
    </AccountProvider>,
  );
  // The trigger only appears once the first /me request has resolved.
  return screen.findByRole('button', { name: new RegExp(en.account.menu, 'i') });
}

beforeEach(() => {
  vi.mocked(createCheckoutSession).mockResolvedValue({ url: 'https://checkout.test/s', sessionId: 'cs_1' });
});

describe('ProfileMenu', () => {
  it('names the trigger with the account menu and the current subscription status', async () => {
    const trigger = await renderMenu(account('none'));

    expect(trigger).toHaveAccessibleName(new RegExp(en.subscription.statusNone, 'i'));
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays closed until the trigger is pressed', async () => {
    await renderMenu(account('none'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows the name and the subscription status on the closed trigger', async () => {
    const trigger = await renderMenu(account('none'));

    // Both are readable without opening anything, which is the whole point of
    // putting the status on the trigger rather than only inside the panel.
    expect(within(trigger).getByText('Demo User')).toBeInTheDocument();
    expect(within(trigger).getByText(en.subscription.statusNone)).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows the active status on the closed trigger once subscribed', async () => {
    const trigger = await renderMenu(account('active'));

    expect(within(trigger).getByText(en.subscription.statusActive)).toBeInTheDocument();
  });

  it('states the status only once in the trigger accessible name', async () => {
    const trigger = await renderMenu(account('none'));

    // The visible status text is aria-hidden, so the screen-reader name carries
    // the label/value pair exactly once rather than repeating the word.
    const occurrences = (trigger.textContent ?? '').split(en.subscription.statusNone).length - 1;
    expect(occurrences).toBe(2); // one visible, one inside the visually-hidden pair
    const accessibleName = trigger.getAttribute('aria-label') ?? trigger.textContent ?? '';
    expect(accessibleName).toContain(en.subscription.statusNone);
  });

  it('reveals the name, email and status once opened', async () => {
    const user = userEvent.setup();
    const trigger = await renderMenu(account('none'));

    await user.click(trigger);

    const menu = await screen.findByRole('menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(menu).getByText('Demo User')).toBeInTheDocument();
    expect(within(menu).getByText('demo@foodproductfinder.test')).toBeInTheDocument();
    expect(within(menu).getByText(en.subscription.statusNone)).toBeInTheDocument();
  });

  it('offers Subscribe while there is no active subscription', async () => {
    const user = userEvent.setup();
    const trigger = await renderMenu(account('none'));

    await user.click(trigger);
    const menu = await screen.findByRole('menu');

    expect(within(menu).getByRole('button', { name: en.subscription.subscribe })).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: en.subscription.manage })).not.toBeInTheDocument();
  });

  it('offers Manage instead once the subscription is active', async () => {
    const user = userEvent.setup();
    const trigger = await renderMenu(account('active'));

    await user.click(trigger);
    const menu = await screen.findByRole('menu');

    expect(within(menu).getByRole('button', { name: en.subscription.manage })).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: en.subscription.subscribe })).not.toBeInTheDocument();
  });

  it('starts checkout from the menu and hands the tab to Stripe', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const user = userEvent.setup();
    const trigger = await renderMenu(account('none'));

    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: en.subscription.subscribe }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://checkout.test/s');
    });
  });

  it('closes on Escape and hands focus back to the trigger', async () => {
    const user = userEvent.setup();
    const trigger = await renderMenu(account('none'));

    await user.click(trigger);
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    // Losing focus to <body> here would restart tabbing from the top of the page.
    expect(trigger).toHaveFocus();
  });

  it('closes when a click lands outside the menu', async () => {
    const user = userEvent.setup();
    const trigger = await renderMenu(account('none'));

    await user.click(trigger);
    await screen.findByRole('menu');
    await user.click(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('renders nothing while the account request is still in flight', async () => {
    vi.mocked(getAccount).mockReturnValue(new Promise(() => undefined));
    renderWithIntl(
      <AccountProvider>
        <ProfileMenu />
      </AccountProvider>,
    );

    expect(screen.queryByRole('button', { name: new RegExp(en.account.menu, 'i') })).not.toBeInTheDocument();
    expect(screen.getByText(en.common.loading)).toBeInTheDocument();
  });
});
