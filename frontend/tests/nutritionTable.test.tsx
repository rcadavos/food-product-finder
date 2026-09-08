import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NutritionTable } from '@/components/NutritionTable';
import en from '../messages/en.json';
import fr from '../messages/fr.json';
import nl from '../messages/nl.json';
import { emptyNutritionFacts, nutritionFacts } from './helpers/fixtures';
import { renderWithIntl } from './helpers/render';

/** The nine keys in the order the backend guarantees, paired with their English labels. */
const ENGLISH_LABELS = [
  en.nutrition.keys['energy-kcal'],
  en.nutrition.keys.fat,
  en.nutrition.keys['saturated-fat'],
  en.nutrition.keys.carbohydrates,
  en.nutrition.keys.sugars,
  en.nutrition.keys.fiber,
  en.nutrition.keys.proteins,
  en.nutrition.keys.salt,
  en.nutrition.keys.sodium,
];

/** The `<tr>` whose row header carries `label`. */
function rowFor(label: string): HTMLTableRowElement {
  const header = screen.getByRole('rowheader', { name: label });
  const row = header.closest('tr');
  if (row === null) throw new Error(`Row header "${label}" is not inside a <tr>`);
  return row;
}

describe('NutritionTable', () => {
  it('renders one row per nutrient, in the backend order, with the translated label', () => {
    renderWithIntl(<NutritionTable nutrition={nutritionFacts()} />);

    const headers = screen.getAllByRole('rowheader');
    expect(headers).toHaveLength(9);
    expect(headers.map((header) => header.textContent)).toEqual(ENGLISH_LABELS);
  });

  it('formats the per-100 g amounts with their unit', () => {
    renderWithIntl(<NutritionTable nutrition={nutritionFacts()} />);

    const energy = within(rowFor(en.nutrition.keys['energy-kcal'])).getAllByRole('cell');
    expect(energy[0]).toHaveTextContent(/^539 kcal$/);

    const fat = within(rowFor(en.nutrition.keys.fat)).getAllByRole('cell');
    expect(fat[0]).toHaveTextContent(/^30\.9 g$/);
    expect(fat[1]).toHaveTextContent(/^4\.64 g$/);
  });

  it('renders an em dash for a missing amount instead of a zero or the word null', () => {
    renderWithIntl(<NutritionTable nutrition={nutritionFacts()} />);

    // Open Food Facts simply has no fibre figure for this product; showing 0 g would be a lie.
    const fibre = rowFor(en.nutrition.keys.fiber);
    const cells = within(fibre).getAllByRole('cell');
    expect(cells).toHaveLength(2);
    expect(cells.map((cell) => cell.textContent)).toEqual(['—', '—']);
    expect(fibre.textContent ?? '').toMatch(/^[^0-9]*$/);
    expect(fibre.textContent ?? '').not.toContain('null');
  });

  it('omits the per-serving column when the product has no per-serving data', () => {
    renderWithIntl(<NutritionTable nutrition={nutritionFacts({ hasPerServing: false })} />);

    expect(screen.getByRole('columnheader', { name: en.nutrition.per100g })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: en.nutrition.perServing })).toBeNull();
    expect(within(rowFor(en.nutrition.keys.fat)).getAllByRole('cell')).toHaveLength(1);
  });

  it('adds the per-serving column when the product has per-serving data', () => {
    renderWithIntl(<NutritionTable nutrition={nutritionFacts({ hasPerServing: true })} />);

    const columns = screen.getAllByRole('columnheader');
    expect(columns.map((column) => column.textContent)).toEqual([
      en.nutrition.nutrient,
      en.nutrition.per100g,
      en.nutrition.perServing,
    ]);
    expect(within(rowFor(en.nutrition.keys.fat)).getAllByRole('cell')).toHaveLength(2);
  });

  it('replaces the table with the empty-state message when there are no values at all', () => {
    renderWithIntl(<NutritionTable nutrition={emptyNutritionFacts()} />);

    expect(screen.getByText(en.nutrition.empty)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryAllByRole('rowheader')).toHaveLength(0);
  });

  it('exposes the table to assistive technology with a caption and scoped headers', () => {
    const { container } = renderWithIntl(<NutritionTable nutrition={nutritionFacts()} />);

    const caption = container.querySelector('caption');
    expect(caption).not.toBeNull();
    expect(caption?.textContent).toBe(en.nutrition.title);

    for (const header of screen.getAllByRole('columnheader')) {
      expect(header).toHaveAttribute('scope', 'col');
    }
    for (const header of screen.getAllByRole('rowheader')) {
      expect(header).toHaveAttribute('scope', 'row');
    }
  });

  it('composes the serving-size label through the catalogue, so French keeps its narrow space', () => {
    const { container } = renderWithIntl(
      <NutritionTable nutrition={nutritionFacts({ servingSize: '15 g' })} />,
      { locale: 'fr' },
    );

    // A hard-coded `": "` in JSX cannot produce the U+202F French typography wants.
    // `getByText` collapses that space away, so the raw text is compared instead.
    expect(container.textContent).toContain(`${fr.nutrition.perServing} : 15 g`);
  });

  it('takes the nutrient labels from the active locale catalogue', () => {
    renderWithIntl(<NutritionTable nutrition={nutritionFacts()} />, { locale: 'nl' });

    // Proves the labels are translated keys rather than hard-coded English strings.
    expect(screen.getByRole('rowheader', { name: nl.nutrition.keys.carbohydrates })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: en.nutrition.keys.carbohydrates })).toBeNull();
    expect(screen.getByRole('columnheader', { name: nl.nutrition.nutrient })).toBeInTheDocument();
  });
});
