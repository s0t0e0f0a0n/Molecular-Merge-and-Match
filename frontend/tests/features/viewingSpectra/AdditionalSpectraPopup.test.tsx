import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdditionalSpectraPopup } from '../../../src/features/viewingSpectra/AdditionalSpectraPopup';

describe('AdditionalSpectraPopup', () => {
  it('sorts tabs by priority and then alphabetically, with priority 0 last', () => {
    const spectra = [
      { id: 1, file_path: '/a/c.png', label: 'Zeta', priority: 1 },
      { id: 2, file_path: '/a/b.png', label: 'Alpha', priority: 1 },
      { id: 3, file_path: '/a/h.png', label: 'Hmbc', priority: 12 },
      { id: 4, file_path: '/a/zzz.png', label: 'ZZZ', priority: 0 },
      { id: 5, file_path: '/a/aaa.png', label: 'AAA', priority: 0 },
    ] as any;

    render(<AdditionalSpectraPopup spectra={spectra} />);
    fireEvent.click(screen.getByRole('button', { name: /additional spectra/i }));

    const tabButtons = screen.getAllByRole('button').filter((button) => {
      const label = button.textContent?.trim() ?? '';
      return ['Alpha', 'Zeta', 'Hmbc', 'AAA', 'ZZZ'].includes(label);
    });

    expect(tabButtons.map((button) => button.textContent?.trim())).toEqual([
      'Alpha',
      'Zeta',
      'Hmbc',
      'AAA',
      'ZZZ',
    ]);
  });
});
