import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';

const mockUseRDKit = vi.hoisted(() => vi.fn());

vi.mock('../../src/context/RDKitContext', () => ({
  useRDKit: mockUseRDKit,
}));

import type { Ketcher } from 'ketcher-core';


const METHANOL = {
  smiles: 'CO',
  molFile: [
    '',
    '  Ketcher',
    '',
    '  2  1  0  0  0  0  0  0  0  0999 V2000',
    '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    1.2990    0.7500    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
    '  1  2  1  0     0  0',
    'M  END',
    '',
  ].join('\n'),
};

const ACETONE = {
  smiles: 'CC(=O)C',
  molFile: [
    '',
    '  Ketcher',
    '',
    '  4  3  0  0  0  0  0  0  0  0999 V2000',
    '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    2.5981    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
    '    1.2990    2.2500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '  1  2  1  0     0  0',
    '  2  3  2  0     0  0',
    '  2  4  1  0     0  0',
    'M  END',
    '',
  ].join('\n'),
};

const NITROMETHANE = {
  smiles: 'C[N+](=O)[O-]',
  molFile: [
    '',
    '  Ketcher',
    '',
    '  4  3  0  0  0  0  0  0  0  0999 V2000',
    '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    1.2990    0.7500    0.0000 N   0  3  0  0  0  0  0  0  0  0  0  0',
    '    2.5981    1.5000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
    '    2.5981    0.0000    0.0000 O   0  5  0  0  0  0  0  0  0  0  0  0',
    '  1  2  1  0     0  0',
    '  2  3  2  0     0  0',
    '  2  4  1  0     0  0',
    'M  END',
    '',
  ].join('\n'),
};

const PENTAVALENT_N = {
  smiles: 'CN(=O)=O',
  molFile: [
    '',
    '  Ketcher',
    '',
    '  4  3  0  0  0  0  0  0  0  0999 V2000',
    '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    1.2990    0.7500    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0',
    '    2.5981    1.5000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
    '    2.5981    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
    '  1  2  1  0     0  0',
    '  2  3  2  0     0  0',
    '  2  4  2  0     0  0',
    'M  END',
    '',
  ].join('\n'),
};

const PENTAVALENT_C = {
  smiles: 'C(C)(C)(C)(C)C',
  molFile: [
    '',
    '  Ketcher',
    '',
    '  6  5  0  0  0  0  0  0  0  0999 V2000',
    '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    1.2990   -0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '   -1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '   -1.2990   -0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    0.0000    1.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '  1  2  1  0     0  0',
    '  1  3  1  0     0  0',
    '  1  4  1  0     0  0',
    '  1  5  1  0     0  0',
    '  1  6  1  0     0  0',
    'M  END',
    '',
  ].join('\n'),
};

let capturedOnInit: ((ketcher: Ketcher) => void) | null = null;

vi.mock('ketcher-react', () => ({
  Editor: (props: { onInit?: (ketcher: Ketcher) => void }) => {
    capturedOnInit = props.onInit ?? null;
    return null;
  },
}));

vi.mock('ketcher-standalone', () => ({
  StandaloneStructServiceProvider: class {},
}));

import KetcherEditor from '../../src/components/KetcherEditor';

function makeAtoms(badConnFlags: boolean[]) {
  return new Map(badConnFlags.map((badConn, i) => [i, { badConn }]));
}


function makeMockKetcher(smiles: string, molFile: string, badConnFlags: boolean[] = []) {
  const handlers: Array<() => void> = [];
  return {
    getSmiles: vi.fn().mockResolvedValue(smiles),
    getMolfile: vi.fn().mockResolvedValue(molFile),
    setMolecule: vi.fn().mockResolvedValue(undefined),
    editor: {
      struct: vi.fn().mockReturnValue({ atoms: makeAtoms(badConnFlags) }),
      zoom: vi.fn(),
    },
    changeEvent: {
      add: vi.fn((h: () => void) => handlers.push(h)),
      remove: vi.fn(),
    },
    _fireChange: () => act(() => handlers.forEach((h) => h())),
  };
}

function renderEditor(smiles: string, molFile: string, badConnFlags: boolean[] = []) {
  const onExportFragment = vi.fn();
  const mockKetcher = makeMockKetcher(smiles, molFile, badConnFlags);

  render(<KetcherEditor onExportFragment={onExportFragment} /> as ReactElement);

  act(() => {
    capturedOnInit!(mockKetcher as unknown as Ketcher);
  });

  return { onExportFragment, mockKetcher };
}


describe('KetcherEditor — export validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnInit = null;

    mockUseRDKit.mockReturnValue({
      rdkit: null,
      loading: true,
      error: null,
    });
  });

  describe('valid structures — export proceeds', () => {
    it.each([
      ['methanol (CO)', METHANOL, [false, false]],
      ['acetone (CC(=O)C)', ACETONE, [false, false, false, false]],
      ['nitromethane with correct zwitterion charges (C[N+](=O)[O-])', NITROMETHANE, [false, false, false, false]],
    ])('%s', async (_, structure, badConnFlags) => {
      const { onExportFragment } = renderEditor(structure.smiles, structure.molFile, badConnFlags);

      await userEvent.setup().click(screen.getByRole('button', { name: /export to fragment space/i }));

      await waitFor(() =>
        expect(onExportFragment).toHaveBeenCalledWith({
          smiles: structure.smiles,
          molFile: structure.molFile,
        }),
      );
    });
  });

  describe('invalid structures — export is blocked', () => {
    it.each([
      ['pentavalent nitrogen — N with two double bonds to O, no formal charge (the bug case)', PENTAVALENT_N, [false, true, false, false]],
      ['pentavalent carbon — C hub with 5 single bonds', PENTAVALENT_C, [true, false, false, false, false, false]],
    ])('%s', async (_, structure, badConnFlags) => {
      const { onExportFragment } = renderEditor(structure.smiles, structure.molFile, badConnFlags);

      await userEvent.setup().click(screen.getByRole('button', { name: /export to fragment space/i }));

      await waitFor(() =>
        expect(screen.queryByText(/invalid structure/i)).toBeInTheDocument(),
      );
      expect(onExportFragment).not.toHaveBeenCalled();
    });
  });

  describe('dynamic validation via changeEvent', () => {
    it('shows the error in red when the structure becomes invalid', () => {
      const { mockKetcher } = renderEditor('', '', []);

      mockKetcher.editor.struct.mockReturnValue({ atoms: makeAtoms([false, true, false, false]) });
      mockKetcher._fireChange();

      const msg = screen.getByText(/invalid structure/i);
      expect(msg).toBeInTheDocument();
      expect(msg).toHaveStyle({ color: '#c00' });
    });

    it('clears the red error when the structure is fixed', () => {
      const { mockKetcher } = renderEditor('', '', [false, true, false, false]);

      mockKetcher._fireChange();
      expect(screen.getByText(/invalid structure/i)).toBeInTheDocument();

      mockKetcher.editor.struct.mockReturnValue({ atoms: makeAtoms([false, false, false, false]) });
      mockKetcher._fireChange();

      expect(screen.queryByText(/invalid structure/i)).not.toBeInTheDocument();
    });

    it('subscribes to changeEvent on editor init', () => {
      const { mockKetcher } = renderEditor('CO', METHANOL.molFile, []);
      expect(mockKetcher.changeEvent.add).toHaveBeenCalledOnce();
    });

    it('unsubscribes from changeEvent on unmount', () => {
      const { mockKetcher, onExportFragment: _ } = renderEditor('CO', METHANOL.molFile, []);
      const { unmount } = render(<KetcherEditor onExportFragment={vi.fn()} /> as ReactElement);
      unmount();
      expect(mockKetcher.changeEvent.remove).toBeDefined();
    });
  });

  it('blocks export for an empty canvas', async () => {
    const { onExportFragment } = renderEditor('', '');

    await userEvent.setup().click(screen.getByRole('button', { name: /export to fragment space/i }));

    await waitFor(() =>
      expect(screen.getByText(/draw a molecule/i)).toBeInTheDocument(),
    );
    expect(onExportFragment).not.toHaveBeenCalled();
  });

  it('clears the editor after a successful export', async () => {
    const { mockKetcher } = renderEditor(METHANOL.smiles, METHANOL.molFile, [false, false]);

    await userEvent.setup().click(screen.getByRole('button', { name: /export to fragment space/i }));

    await waitFor(() => expect(mockKetcher.setMolecule).toHaveBeenCalledWith(''));
  });

  it('leaves the editor intact when validation fails', async () => {
    const { mockKetcher } = renderEditor(
      PENTAVALENT_N.smiles,
      PENTAVALENT_N.molFile,
      [false, true, false, false],
    );

    await userEvent.setup().click(screen.getByRole('button', { name: /export to fragment space/i }));

    await waitFor(() =>
      expect(screen.queryByText(/invalid structure/i)).toBeInTheDocument(),
    );
    expect(mockKetcher.setMolecule).not.toHaveBeenCalled();
  });

  it('skips getMolfile() when a valence error is detected — avoids exporting a silently normalised structure', async () => {
    const { mockKetcher } = renderEditor(
      PENTAVALENT_N.smiles,
      PENTAVALENT_N.molFile,
      [false, true, false, false],
    );

    await userEvent.setup().click(screen.getByRole('button', { name: /export to fragment space/i }));

    await waitFor(() =>
      expect(screen.queryByText(/invalid structure/i)).toBeInTheDocument(),
    );
    expect(mockKetcher.getMolfile).not.toHaveBeenCalled();
  });
});

describe('RDKit loading errors', () => {
  it('shows a user-visible error when RDKit fails to load', () => {
    mockUseRDKit.mockReturnValue({
      rdkit: null,
      loading: false,
      error: 'Failed to load RDKit_minimal.wasm',
    });

    render(<KetcherEditor onExportFragment={vi.fn()} /> as ReactElement);

    expect(screen.getByText(/rdkit/i)).toBeInTheDocument();
    expect(screen.getByText(/failed|load|wasm/i)).toBeInTheDocument();
  });

  it('blocks export when RDKit is unavailable', async () => {
    mockUseRDKit.mockReturnValue({
      rdkit: null,
      loading: false,
      error: 'Failed to load RDKit_minimal.wasm',
    });

    const { onExportFragment } = renderEditor(
      METHANOL.smiles,
      METHANOL.molFile,
      [false, false],
    );

    await userEvent.setup().click(
      screen.getByRole('button', { name: /export to fragment space/i }),
    );

    expect(onExportFragment).not.toHaveBeenCalled();
    expect(screen.getAllByText(/rdkit/i).length).toBeGreaterThan(0);
  });
});
