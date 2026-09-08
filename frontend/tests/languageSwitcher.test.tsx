import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import en from '../messages/en.json';
import { routerMock, setPathname } from './helpers/navigation';
import { renderWithIntl } from './helpers/render';

/** Endonyms: every language is offered in its own language, whatever the UI locale is. */
const LANGUAGE_NAMES = ['English', 'Nederlands', 'Deutsch', 'Français'];

const PRODUCT_PATH = '/product/3017620422003';

/** next-intl reports the path without its locale prefix; the browser URL keeps it. */
function visit(pathname: string, search = ''): void {
  setPathname(pathname);
  window.history.replaceState({}, '', `/en${pathname}${search}`);
}

function trigger(name: string | RegExp = new RegExp(en.language.label, 'i')) {
  return screen.getByRole('button', { name });
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name?: string | RegExp) {
  await user.click(trigger(name));
  return screen.findByRole('menu');
}

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('LanguageSwitcher', () => {
  it('lists every locale in its own language once opened', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LanguageSwitcher />);

    const menu = await openMenu(user);

    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent?.trim()),
    ).toEqual(LANGUAGE_NAMES);
  });

  it('keeps the language names untranslated when the interface is in another language', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LanguageSwitcher />, { locale: 'de' });

    const menu = await openMenu(user, /Sprache/i);

    // A German speaker looking for French must still recognise "Français".
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent?.trim()),
    ).toEqual(LANGUAGE_NAMES);
  });

  it('marks the current locale as the checked option', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LanguageSwitcher />, { locale: 'nl' });

    const menu = await openMenu(user, /Taal/i);

    expect(within(menu).getByRole('menuitemradio', { name: 'Nederlands' })).toBeChecked();
    expect(within(menu).getByRole('menuitemradio', { name: 'English' })).not.toBeChecked();
  });

  it('names the trigger with the label and the active language', () => {
    renderWithIntl(<LanguageSwitcher />, { locale: 'fr' });

    // The visible code is decorative, so the announced name carries the real pair.
    expect(trigger(/Langue/i)).toHaveAccessibleName(/Langue.*Français/);
  });

  it('stays closed until the trigger is pressed', () => {
    renderWithIntl(<LanguageSwitcher />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('switches locale on the current page instead of sending the visitor home', async () => {
    const user = userEvent.setup();
    visit(PRODUCT_PATH);
    renderWithIntl(<LanguageSwitcher />);

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Nederlands' }));

    expect(routerMock.replace).toHaveBeenCalledTimes(1);
    expect(routerMock.replace).toHaveBeenCalledWith(PRODUCT_PATH, { locale: 'nl' });
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('carries the query string across the language switch', async () => {
    const user = userEvent.setup();
    visit('/', '?q=chocolade&page=2');
    renderWithIntl(<LanguageSwitcher />);

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Français' }));

    // Losing `?q=` here would silently reset an in-progress search.
    expect(routerMock.replace).toHaveBeenCalledWith('/?q=chocolade&page=2', { locale: 'fr' });
  });

  it('does not navigate while the visitor only opens the menu', async () => {
    const user = userEvent.setup();
    visit(PRODUCT_PATH);
    renderWithIntl(<LanguageSwitcher />);

    await openMenu(user);

    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('does not navigate when the already-active language is chosen', async () => {
    const user = userEvent.setup();
    visit(PRODUCT_PATH);
    renderWithIntl(<LanguageSwitcher />);

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitemradio', { name: 'English' }));

    expect(routerMock.replace).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('moves focus to the checked option when it opens', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LanguageSwitcher />, { locale: 'de' });

    const menu = await openMenu(user, /Sprache/i);

    await waitFor(() => {
      expect(within(menu).getByRole('menuitemradio', { name: 'Deutsch' })).toHaveFocus();
    });
  });

  it('walks the options with the arrow keys', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LanguageSwitcher />);

    const menu = await openMenu(user);
    await user.keyboard('{ArrowDown}');

    expect(within(menu).getByRole('menuitemradio', { name: 'Nederlands' })).toHaveFocus();

    // Wrapping backwards from the first option lands on the last.
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(within(menu).getByRole('menuitemradio', { name: 'Français' })).toHaveFocus();
  });

  it('closes on Escape and hands focus back to the trigger', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LanguageSwitcher />);

    await openMenu(user);
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(trigger()).toHaveFocus();
  });

  it('closes when a click lands outside the menu', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LanguageSwitcher />);

    await openMenu(user);
    await user.click(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});
