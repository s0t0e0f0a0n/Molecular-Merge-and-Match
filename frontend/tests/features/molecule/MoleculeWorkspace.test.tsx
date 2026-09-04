import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Valid V2000 MOL block for C=O (formaldehyde-like)
const MOCK_MOLFILE = [
  '',
  '  mock',
  '',
  '  2  1  0  0  0  0  0  0  0  0999 V2000',
  '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
  '  1  2  2  0  0  0  0',
  'M  END',
].join('\n');

// Mock KetcherEditor to avoid paper.js canvas errors in jsdom.
// Returns a minimal UI with an export button that triggers onExportFragment.
vi.mock('../../../src/components/KetcherEditor', () => ({
  default: ({ onExportFragment }: { onExportFragment: (f: { smiles: string; molFile: string }) => void }) => (
    <div>
      <h2>Molecule Editor</h2>
      <span>Editor ready</span>
      <button onClick={() => onExportFragment({ smiles: 'C=O', molFile: MOCK_MOLFILE })}>
        Export to fragment space
      </button>
    </div>
  ),
}));

import { MoleculeWorkspace } from '../../../src/features/molecule/MoleculeWorkspace';
import { RDKitProvider } from '../../../src/context/RDKitContext';

function renderWithProviders(ui: React.ReactElement) {
  return render(<RDKitProvider>{ui}</RDKitProvider>);
}

describe('MoleculeWorkspace', () => {
  it('calls onCreateFragment when exporting from the default editor', async () => {
    const user = userEvent.setup();
    const onCreateFragment = vi.fn(async () => 1);

    renderWithProviders(
      <MoleculeWorkspace
        onCreateFragment={onCreateFragment}
        onUpdateFragment={vi.fn(async () => true)}
      />,
    );

    expect(await screen.findByText(/Molecule Editor/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Export to fragment space/i }));

    expect(onCreateFragment).toHaveBeenCalledWith(
      '',
      'C=O',
      MOCK_MOLFILE,
    );
  });
});
