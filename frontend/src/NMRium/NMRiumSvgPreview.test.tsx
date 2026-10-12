import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { ExerciseCreationDataConfirmation } from './ExerciseCreationDataConfirmation';
import { NMRiumSvgPreview } from './NMRiumSvgPreview';
import { initializePrimarySpectrumSelections } from './spectrumMetadata';
import type {
  NMRiumDraftData,
  NMRiumDraftSpectrum,
  NMRiumSvgExport,
} from '../api/exerciseCreation';

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

  it('defaults primary spectra to the first integrated proton and first carbon spectrum', () => {
    const makeSpectrum = (
      id: string,
      nucleus: string,
      multiplets: unknown[] = [],
    ): NMRiumDraftSpectrum => ({
      id,
      dimension: 1,
      nucleus,
      info: {},
      peaks: [],
      multiplets,
      spectrometer: null,
      sourceSession: null,
      experimentNumber: null,
      dataSource: null,
    });
    const initialized = initializePrimarySpectrumSelections([
      makeSpectrum('proton-without-integrals', '1H'),
      makeSpectrum('integrated-proton', '1H', [{ integration: 3 }]),
      makeSpectrum('later-integrated-proton', '1H', [{ integration: 2 }]),
      makeSpectrum('first-carbon', '13C'),
      makeSpectrum('second-carbon', '13C'),
    ]);

    expect(
      initialized.filter((spectrum) => spectrum.isPrimary).map((spectrum) => spectrum.id),
    ).toEqual(['integrated-proton', 'first-carbon']);
    expect(
      initializePrimarySpectrumSelections([
        {
          ...makeSpectrum('explicitly-unselected', '1H', [{ integration: 1 }]),
          isPrimary: false,
        },
      ])[0].isPrimary,
    ).toBe(false);
  });

  it('shows stored NMRium data confirmation below the SVG exports', () => {
    const { container } = render(
      <NMRiumSvgPreview
        data={data}
        exports={exports}
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
    expect(screen.getByText('400.0 MHz')).toBeVisible();
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

  it('does not show 2D spectra in the data confirmation section', () => {
    const twoDimensional: NMRiumDraftSpectrum = {
      id: 'cosy',
      dimension: 2,
      nucleus: ['1H', '1H'],
      info: { name: 'COSY' },
      peaks: [],
      multiplets: [],
      spectrometer: null,
      sourceSession: null,
      experimentNumber: null,
      dataSource: null,
    };
    render(
      <NMRiumSvgPreview
        data={{ spectra: [twoDimensional] }}
        exports={[
          {
            id: 'cosy',
            name: 'COSY',
            nucleus: '1H, 1H',
            file_name: 'cosy.svg',
            url: '/nmrium-temp/cosy.svg',
            selected: true,
            dimension: 2,
            ppmRange: [10, 0],
            secondPpmRange: [10, 0],
            integralVerticalPosition: 0,
          },
        ]}
        busy={false}
        error=""
        onBack={vi.fn()}
        onExportsChange={vi.fn()}
        onUpdateSettings={vi.fn().mockResolvedValue(undefined)}
        onDataChange={vi.fn().mockResolvedValue(undefined)}
        onContinue={vi.fn()}
      />,
    );

    const confirmation = screen.getByRole('region', {
      name: 'Stored NMRium data confirmation',
    });
    expect(confirmation).toHaveTextContent('No 1D spectra were saved.');
    expect(confirmation).not.toHaveTextContent('COSY');
  });

  it('saves carbon counts for multiple picked carbon peaks without crashing', async () => {
    const onDataChange = vi.fn().mockResolvedValue(undefined);
    const initialData: NMRiumDraftData = {
      spectra: [
        {
          id: 'carbon-spectrum',
          dimension: 1,
          nucleus: '13C',
          info: {},
          peaks: [{ x: 140 }, { x: 120 }],
          multiplets: [],
          spectrometer: null,
          sourceSession: null,
          experimentNumber: null,
          dataSource: null,
        },
      ],
    };
    function ConfirmationHarness() {
      const [data, setData] = useState(initialData);
      return (
        <ExerciseCreationDataConfirmation
          data={data}
          onDataChange={async (updatedData) => {
            await onDataChange(updatedData);
            setData(updatedData);
          }}
        />
      );
    }

    render(<ConfirmationHarness />);

    const firstInput = screen.getByRole('spinbutton', {
      name: 'Number of carbon atoms for 140 ppm',
    });
    const secondInput = screen.getByRole('spinbutton', {
      name: 'Number of carbon atoms for 120 ppm',
    });

    fireEvent.change(firstInput, { target: { value: '2' } });
    fireEvent.blur(firstInput);
    await waitFor(() => expect(onDataChange).toHaveBeenCalledTimes(1));

    fireEvent.change(secondInput, { target: { value: '3' } });
    fireEvent.blur(secondInput);
    await waitFor(() => expect(onDataChange).toHaveBeenCalledTimes(2));

    expect(onDataChange.mock.calls[1][0].spectra[0].peaks).toEqual([
      { x: 140, carbonCount: 2 },
      { x: 120, carbonCount: 3 },
    ]);
  });

  it('offers independent vertical ppm range controls for 2D exports', async () => {
    const onUpdateSettings = vi.fn().mockResolvedValue(undefined);
    const twoDimensionalExport: NMRiumSvgExport = {
      id: 'cosy',
      name: 'COSY',
      nucleus: '1H, 1H',
      file_name: 'cosy.svg',
      url: '/nmrium-temp/cosy.svg',
      selected: true,
      dimension: 2,
      ppmRange: [10, 0],
      secondPpmRange: [10, 0],
      integralVerticalPosition: 0,
    };
    render(
      <NMRiumSvgPreview
        data={data}
        exports={[twoDimensionalExport]}
        busy={false}
        error=""
        onBack={vi.fn()}
        onExportsChange={vi.fn()}
        onUpdateSettings={onUpdateSettings}
        onDataChange={vi.fn().mockResolvedValue(undefined)}
        onContinue={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Vertical range start (ppm)'), {
      target: { value: '8' },
    });
    fireEvent.change(screen.getByLabelText('Vertical range end (ppm)'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update preview' }));

    await waitFor(() =>
      expect(onUpdateSettings).toHaveBeenCalledWith(
        'cosy',
        [10, 0],
        0,
        [8, 2],
      ),
    );
  });

  it('saves an exclusive primary proton spectrum selection', async () => {
    const onDataChange = vi.fn().mockResolvedValue(undefined);
    const baseSpectrum = {
      dimension: 1,
      nucleus: '1H',
      info: {},
      peaks: [],
      multiplets: [],
      spectrometer: null,
      sourceSession: null,
      experimentNumber: null,
      dataSource: null,
    };
    const dataWithProtons: NMRiumDraftData = {
      spectra: [
        { ...baseSpectrum, id: 'proton-1', isPrimary: true },
        { ...baseSpectrum, id: 'proton-2', isPrimary: false },
      ],
    };
    render(
      <NMRiumSvgPreview
        data={dataWithProtons}
        exports={[
          { ...exports[0], id: 'proton-1' },
          { ...exports[1], id: 'proton-2' },
        ]}
        busy={false}
        error=""
        onBack={vi.fn()}
        onExportsChange={vi.fn()}
        onUpdateSettings={vi.fn().mockResolvedValue(undefined)}
        onDataChange={onDataChange}
        onContinue={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Primary 1H spectrum' })[1],
    );

    await waitFor(() => expect(onDataChange).toHaveBeenCalledTimes(1));
    expect(
      onDataChange.mock.calls[0][0].spectra.map(
        (spectrum: NMRiumDraftSpectrum) => spectrum.isPrimary,
      ),
    )
      .toEqual([false, true]);
  });

  it('saves spectrum labels from the SVG card header', async () => {
    const onDataChange = vi.fn().mockResolvedValue(undefined);
    const spectrum: NMRiumDraftSpectrum = {
      id: 'proton-1',
      dimension: 1,
      nucleus: '1H',
      info: {},
      peaks: [],
      multiplets: [],
      spectrometer: null,
      sourceSession: null,
      experimentNumber: null,
      dataSource: null,
    };
    render(
      <NMRiumSvgPreview
        data={{ spectra: [spectrum] }}
        exports={[{ ...exports[0], id: 'proton-1' }]}
        busy={false}
        error=""
        onBack={vi.fn()}
        onExportsChange={vi.fn()}
        onUpdateSettings={vi.fn().mockResolvedValue(undefined)}
        onDataChange={onDataChange}
        onContinue={vi.fn()}
      />,
    );

    const labelInput = screen.getByRole('textbox', {
      name: 'Spectrum label for 1H Proton',
    });
    expect(labelInput).toHaveValue('1H');
    expect(labelInput).toHaveStyle({ width: '100px' });
    fireEvent.change(labelInput, { target: { value: 'Proton set A' } });
    fireEvent.blur(labelInput);

    await waitFor(() => expect(onDataChange).toHaveBeenCalledTimes(1));
    expect(onDataChange.mock.calls[0][0].spectra[0].label).toBe('Proton set A');
    expect(
      screen.queryByRole('textbox', { name: /label:/i }),
    ).not.toBeInTheDocument();
  });
});
