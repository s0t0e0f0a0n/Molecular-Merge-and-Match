import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NMRiumSvgPreview } from './NMRiumSvgPreview';
import type { NMRiumDraftData, NMRiumSvgExport } from '../api/exerciseCreation';

afterEach(cleanup);

describe('NMRiumSvgPreview', () => {
  const exports: NMRiumSvgExport[] = [
    {
      id: 'spectrum-1',
      name: 'Proton',
      nucleus: '1H',
      file_name: 'proton.svg',
      url: '/nmrium-temp/proton.svg',
      selected: true,
      ppmRange: [10, 0],
      integralVerticalPosition: 550,
    },
    {
      id: 'spectrum-2',
      name: 'Carbon',
      nucleus: '13C',
      file_name: 'carbon.svg',
      url: '/nmrium-temp/carbon.svg',
      selected: true,
      ppmRange: [210, 0],
      integralVerticalPosition: 550,
    },
  ];
  const data: NMRiumDraftData = { spectra: [] };

  it('keeps each spectrum preview open independently', () => {
    render(
      <NMRiumSvgPreview
        data={data}
        exports={exports}
        skippedTwoDimensionalCount={0}
        busy={false}
        error=""
        onBack={vi.fn()}
        onExportsChange={vi.fn()}
        onUpdateSettings={vi.fn().mockResolvedValue(undefined)}
        onDataChange={vi.fn().mockResolvedValue(undefined)}
        onContinue={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Preview' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.getByAltText('1H spectrum preview')).toBeVisible();
    expect(screen.getByAltText('13C spectrum preview')).toBeVisible();
  });

  it('shows stored NMRium data confirmation below the SVG exports', () => {
    const { container } = render(
      <NMRiumSvgPreview
        data={data}
        exports={exports}
        skippedTwoDimensionalCount={0}
        busy={false}
        error=""
        onBack={vi.fn()}
        onExportsChange={vi.fn()}
        onUpdateSettings={vi.fn().mockResolvedValue(undefined)}
        onDataChange={vi.fn().mockResolvedValue(undefined)}
        onContinue={vi.fn()}
      />,
    );

    const exportsGrid = container.querySelector('main')!.children[1];
    const confirmation = screen.getByRole('region', {
      name: 'Stored NMRium data confirmation',
    });
    expect(
      exportsGrid.compareDocumentPosition(confirmation) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows solvent and frequency beside stacked multiplet and peak tables', () => {
    const spectrumData: NMRiumDraftData = {
      spectra: [
        {
          id: 'spectrum-1',
          dimension: 1,
          nucleus: '1H',
          info: { name: 'Sample', originFrequency: 400 },
          peaks: [{ x: 2.15, y: 1.23456 }],
          multiplets: [
            {
              from: 2.1,
              to: 2.2,
              signals: [{ delta: 2.15, multiplicity: 'd', js: [{ coupling: 5 }], }],
              integration: 1,
            },
          ],
          spectrometer: 'instrument-1',
          sourceSession: 'session',
          experimentNumber: '1',
          dataSource: 'data/sample/1',
          solvent: 'CDCl3',
        },
      ],
    };
    render(
      <NMRiumSvgPreview
        data={spectrumData}
        exports={exports}
        skippedTwoDimensionalCount={0}
        busy={false}
        error=""
        onBack={vi.fn()}
        onExportsChange={vi.fn()}
        onUpdateSettings={vi.fn().mockResolvedValue(undefined)}
        onDataChange={vi.fn().mockResolvedValue(undefined)}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByText('CDCl3')).toBeVisible();
    expect(screen.getByText('400 MHz')).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Intensity' })).toBeVisible();
    expect(screen.getByText('1.2346')).toBeVisible();
    const spectrumSection = screen
      .getByRole('heading', { level: 3, name: '1H - Sample' })
      .closest('section');
    const columns = spectrumSection?.children[0];
    expect(columns).toHaveStyle({ display: 'grid' });
    expect(columns?.children[0]).toContainElement(screen.getByText('CDCl3'));
    expect(columns?.children[1]).toContainElement(
      screen.getByRole('heading', { level: 4, name: 'Multiplets' }),
    );
    expect(columns?.children[1]).toContainElement(
      screen.getByRole('heading', { level: 4, name: 'Picked peaks' }),
    );
  });
});
