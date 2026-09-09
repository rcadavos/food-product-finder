import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountryList } from '@/components/CountryList';
import type { CountryTag } from '@/lib/types';
import { renderWithIntl } from './helpers/render';

function country(name: string, code: string | null): CountryTag {
  return { name, code };
}

describe('CountryList', () => {
  it('lists each country the product is sold in', () => {
    renderWithIntl(
      <CountryList label="Sold in" countries={[country('France', 'FR'), country('Duitsland', 'DE')]} />,
    );

    expect(
      within(screen.getByRole('list'))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['France', 'Duitsland']);
  });

  it('draws a flag for a country it has artwork for', () => {
    const { container } = renderWithIntl(
      <CountryList label="Sold in" countries={[country('France', 'FR')]} />,
    );

    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('falls back to the ISO code when there is no artwork', () => {
    // A missing flag must never cost the visitor the country itself.
    renderWithIntl(<CountryList label="Sold in" countries={[country('Portugal', 'PT')]} />);

    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('Portugal');
    expect(item).toHaveTextContent('PT');
  });

  it('renders the name alone when the API resolved no code', () => {
    const { container } = renderWithIntl(
      <CountryList label="Sold in" countries={[country('Narnia', null)]} />,
    );

    expect(screen.getByRole('listitem')).toHaveTextContent('Narnia');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('keeps the flags out of the accessibility tree', () => {
    const { container } = renderWithIntl(
      <CountryList label="Sold in" countries={[country('France', 'FR'), country('Portugal', 'PT')]} />,
    );

    // Decorative: the country name next to them is already the label.
    for (const node of container.querySelectorAll('svg, span[aria-hidden]')) {
      expect(node).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('shows the empty text when the product names no country', () => {
    renderWithIntl(<CountryList label="Sold in" countries={[]} emptyText="Not available" />);

    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders nothing at all when empty and no fallback text is given', () => {
    const { container } = renderWithIntl(<CountryList label="Sold in" countries={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
