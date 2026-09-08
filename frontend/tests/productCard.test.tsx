import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductCard } from '@/components/ProductCard';
import en from '../messages/en.json';
import { productSummary, sparseProductSummary } from './helpers/fixtures';
import { renderWithIntl } from './helpers/render';

/**
 * Open Food Facts is crowd-sourced, so "half the fields are null" is the normal
 * case rather than an edge case. These tests pin the degraded rendering as hard as
 * the happy path.
 */
describe('ProductCard', () => {
  it('renders the product name, brands, quantity and Nutri-Score', () => {
    renderWithIntl(<ProductCard product={productSummary({ nutriscoreGrade: 'b' })} />);

    expect(screen.getByRole('heading', { name: 'Nutella hazelnut spread' })).toBeInTheDocument();
    expect(screen.getByText('Ferrero, Nutella')).toBeInTheDocument();
    expect(screen.getByText('400 g')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Nutri-Score B' })).toBeInTheDocument();
  });

  it('links to the locale-aware product route by barcode', () => {
    renderWithIntl(<ProductCard product={productSummary()} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/product/3017620422003');
  });

  it('renders the product photo when Open Food Facts has one', () => {
    const { container } = renderWithIntl(<ProductCard product={productSummary()} />);

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    // The heading already names the product, so the photo is decorative.
    expect(image).toHaveAttribute('alt', '');
    expect(image?.getAttribute('src') ?? '').toContain('images.openfoodfacts.org');
  });

  it('falls back to translated placeholders when every field is missing', () => {
    const { container } = renderWithIntl(<ProductCard product={sparseProductSummary()} />);

    expect(screen.getByRole('heading', { name: en.product.nameUnknown })).toBeInTheDocument();
    expect(screen.getByText(en.product.brandsUnknown)).toBeInTheDocument();
    expect(screen.getByText(en.product.noImage)).toBeInTheDocument();

    // A broken <img> is worse than a labelled placeholder box.
    expect(container.querySelector('img')).toBeNull();
    // No grade means no badge at all, rather than an empty grey square.
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('uses the active locale copy for the fallbacks', () => {
    renderWithIntl(<ProductCard product={sparseProductSummary()} />, { locale: 'nl' });

    expect(screen.getByRole('heading', { name: 'Naamloos product' })).toBeInTheDocument();
  });
});
